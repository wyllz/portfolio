import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let xScale, yScale; // global so the brush code (Step 5) can use them

async function loadData() {
  return d3.csv('loc.csv', (row) => ({
    ...row,
    line: +row.line,
    depth: +row.depth,
    length: +row.length,
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3.groups(data, (d) => d.commit).map(([commit, lines]) => {
    let { author, date, time, timezone, datetime } = lines[0];
    let ret = {
      id: commit,
      url: 'https://github.com/wyllz/portfolio/commit/' + commit,
      author,
      date,
      time,
      timezone,
      datetime,
      hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
      totalLines: lines.length,
    };
    Object.defineProperty(ret, 'lines', {
      value: lines,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return ret;
  });
}

function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');
  const add = (label, value) => {
    dl.append('dt').html(label);
    dl.append('dd').text(value);
  };

  add('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  add('Total commits', commits.length);
  add('Files', d3.group(data, (d) => d.file).size);
  add('Max depth', d3.max(data, (d) => d.depth));
  add('Avg line length', d3.mean(data, (d) => d.length).toFixed(1));

  const fileLengths = d3.rollups(data, (v) => d3.max(v, (d) => d.line), (d) => d.file);
  add('Avg file length', d3.mean(fileLengths, (d) => d[1]).toFixed(1));

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  add('Most active time', d3.greatest(workByPeriod, (d) => d[1])?.[0]);
}

function renderScatterPlot(data, commits) {
  const width = 1000, height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 }; // 40 so "00:00" labels fit
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

  // 2.3 gridlines (drawn first so they sit behind)
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // 4.1–4.3 radius scale + sort so small dots are drawn on top
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  // 2.1 dots + 3.x tooltip events
  svg
    .append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', updateTooltipPosition)
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // 2.2 axes
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));
  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'));

  // 5.1 brush
  createBrushSelector(svg);
}

function renderTooltipContent(commit) {
  if (Object.keys(commit).length === 0) return;
  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id;
  document.getElementById('commit-date').textContent =
    commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise(); // 5.2: brings tooltips back
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) => isCommitSelected(selection, d));
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selected = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  document.querySelector('#selection-count').textContent =
    `${selected.length || 'No'} commits selected`;
  return selected;
}

function renderLanguageBreakdown(selection) {
  const selected = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  const container = document.getElementById('language-breakdown');
  if (selected.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selected.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);
  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const pct = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${pct})</dd>`;
  }
}

let data = await loadData();
let commits = processCommits(data);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
