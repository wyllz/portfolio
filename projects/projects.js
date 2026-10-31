import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

const title = document.querySelector('.projects-title');
if (title) title.textContent = `${projects.length} Projects`;

let query = '';
let selectedYear = null; // store the year (not the index) so it survives re-renders

// Projects matching the search box only (what the pie chart shows)
function searchProjects() {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// Projects matching BOTH the search box and the selected pie slice
function applyFilters() {
  let filtered = searchProjects().filter(
    (project) => selectedYear === null || project.year === selectedYear,
  );
  renderProjects(filtered, projectsContainer, 'h2');
}

function renderPieChart(projectsGiven) {
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));
  let colors = d3.scaleOrdinal(d3.schemeTableau10);

  // clear old paths and legend items before redrawing
  let svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  let isSelected = (idx) => data[idx].label === selectedYear;

  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(i))
      .attr('class', isSelected(i) ? 'selected' : '')
      .on('click', () => {
        selectedYear = isSelected(i) ? null : data[i].label;

        svg
          .selectAll('path')
          .attr('class', (_, idx) => (isSelected(idx) ? 'selected' : ''));
        legend
          .selectAll('li')
          .attr('class', (_, idx) =>
            isSelected(idx) ? 'legend-item selected' : 'legend-item',
          );

        applyFilters();
      });
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(idx)}`)
      .attr('class', isSelected(idx) ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
  });
}

renderPieChart(projects);

let searchInput = document.querySelector('.searchBar');
searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  renderPieChart(searchProjects());
  applyFilters();
});
