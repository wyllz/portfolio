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
        author, date, time, timezone, datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', {
        value: lines, enumerable: false, writable: false, configurable: false,
      });
      return ret;
    });
  }
  