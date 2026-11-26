import * as d3 from "npm:d3";

const color = d3.scaleOrdinal(["East", "West"], ["#1b9e77", "#d95f02"]);
const WIN_DOMAIN = [0.15, 0.85];
const formatWin = (v) => d3.format(".3f")(v).slice(1);
const lastName = (name) => name.split(" ").slice(1).join(" ");
const headshot = (id) => `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
const BANDS = ["Playoffs (1-6)", "Play-in (7-10)", "Lottery (11-15)"];

export function dashboard(teams, width) {
  let hovered = null;
  let selected = new Set();

  const root = d3.create("div").attr("class", "dash");
  const tooltip = root.append("div").attr("class", "tooltip");

  function refresh() {
    root.classed("has-focus", hovered !== null || selected.size > 0);
    root.selectAll(".team").classed("focus", (d) => d.team === hovered || selected.has(d.team));
  }

  function clearSelection() {
    selected.clear();
    refresh();
  }

  function addInteractions(marks, showPhoto) {
    marks
      .on("pointerenter", (event, d) => {
        hovered = d.team;
        tooltip.html(tooltipHtml(d, showPhoto)).style("display", "block");
        moveTooltip(event);
        refresh();
      })
      .on("pointermove", moveTooltip)
      .on("pointerleave", () => {
        hovered = null;
        tooltip.style("display", "none");
        refresh();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (selected.has(d.team)) selected.delete(d.team);
        else selected.add(d.team);
        refresh();
      });
  }

  function moveTooltip(event) {
    const [x, y] = d3.pointer(event, root.node());
    const flip = x > width - 300;
    tooltip.style("left", `${flip ? x - 296 : x + 16}px`).style("top", `${y + 16}px`);
  }

  function tooltipHtml(d, showPhoto) {
    const pct = (v) => (v * 100).toFixed(1) + "%";
    const diff = gap(d) * 100;
    return `
      ${showPhoto ? `<img src="${headshot(d.best_player_id)}" alt="">` : ""}
      <strong>${d.best_player}</strong>, ${d.team_name} (${d.wins}–${d.losses})
      <table>
        <tr><td>Win%</td><td>${formatWin(d.win_pct)}</td></tr>
        <tr><td>Conference seed</td><td>${d.seed} · ${d.seed_band}</td></tr>
        <tr><td>Best player PER</td><td>${d.best_per.toFixed(1)}</td></tr>
        <tr><td>Games played</td><td>${Math.round(d.best_gp_pct * 100)}%</td></tr>
        <tr><td>Teammate eFG%, off → on</td><td>${pct(d.tm8_efg_off)} → ${pct(d.tm8_efg_on)}</td></tr>
        <tr><td>On − off gap</td><td>${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts</td></tr>
        <tr><td>Rest-of-roster PER</td><td>${d.roster_per.toFixed(1)}</td></tr>
      </table>`;
  }

  function scatter(parent, {w, h, xValue, xTitle, radius, photo}) {
    const m = {top: 20, right: 30, bottom: 40, left: 45};
    const x = d3.scaleLinear(d3.extent([...teams.map(xValue), 15]), [m.left, w - m.right]).nice();
    const y = d3.scaleLinear(WIN_DOMAIN, [h - m.bottom, m.top]);
    const svg = parent.append("svg").attr("width", w).attr("height", h);

    svg.append("g").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x));
    svg.append("g").attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).tickFormat(formatWin).tickSize(-(w - m.left - m.right)));
    svg.append("text").attr("class", "axis-title").attr("x", w - m.right).attr("y", h - 6)
      .attr("text-anchor", "end").text(xTitle + " →");
    svg.append("text").attr("class", "axis-title").attr("x", 0).attr("y", 10).text("↑ Team win%");

    referenceLine(svg, x(15), x(15), m.top, h - m.bottom, "League avg PER 15");
    referenceLine(svg, m.left, w - m.right, y(0.5), y(0.5), ".500");

    const fit = linearFit(teams, xValue, (d) => d.win_pct);
    const [x0, x1] = d3.extent(teams, xValue);
    svg.append("line").attr("class", "fit")
      .attr("x1", x(x0)).attr("y1", y(fit.predict(x0)))
      .attr("x2", x(x1)).attr("y2", y(fit.predict(x1)));
    parent.select(".subtitle").append("b").text(` Correlation r = ${fit.r.toFixed(2)}.`);

    const dots = svg.append("g").selectAll("g")
      .data(d3.sort(teams, (d) => -radius(d)))
      .join("g")
      .attr("class", "team mark")
      .attr("transform", (d) => `translate(${x(xValue(d))},${y(d.win_pct)})`);
    dots.append("circle").attr("class", "hit").attr("r", 12);
    dots.append("circle").attr("r", radius).attr("fill", (d) => color(d.conference));
    addInteractions(dots, photo);

    const labelBox = placeLabels(
      teams.map((d) => ({team: d.team, cx: x(xValue(d)), cy: y(d.win_pct), r: radius(d)})),
      w - m.right);
    svg.append("g").selectAll("text").data(teams).join("text")
      .attr("class", "team mark label")
      .attr("x", (d) => labelBox.get(d.team).x)
      .attr("y", (d) => labelBox.get(d.team).y + 8)
      .text((d) => d.team);

    return {svg, x, y, m};
  }

  const halfWidth = (width - 32) / 2;
  const panelA = panel(root, "A: Does a high-PER player impact win%?",
    "Dots = each team's highest PER player. \n Dot size = percentage of team games played by that player");
  const rowBC = root.append("div").attr("class", "row");
  const panelB = panel(rowBC, "B: Who improves their teammates the most?",
    "Change in teammates' effective field goal % when the star is on the court. Rows grouped by conference seed.");
  const panelC = panel(rowBC, "C: Who had the most help?",
    "Minutes-weighted average PER of each team's other players.");

  const size = d3.scaleSqrt([0, 1], [0, 13]);
  const A = scatter(panelA, {
    w: width, h: 460, xValue: (d) => d.best_per, xTitle: "Best player PER",
    radius: (d) => size(d.best_gp_pct), photo: true,
  });

  const median = d3.median(teams, (d) => d.best_per);
  referenceLine(A.svg, A.x(median), A.x(median), A.m.top, 460 - A.m.bottom, `Median best player (${median.toFixed(1)})`);

  const brush = d3.brush()
    .extent([[A.m.left, A.m.top], [width - A.m.right, 460 - A.m.bottom]])
    .on("end", (event) => {
      if (!event.sourceEvent) return;
      if (!event.selection) return clearSelection();
      const [[bx0, by0], [bx1, by1]] = event.selection;
      selected = new Set(teams
        .filter((d) => bx0 <= A.x(d.best_per) && A.x(d.best_per) <= bx1 && by0 <= A.y(d.win_pct) && A.y(d.win_pct) <= by1)
        .map((d) => d.team));
      brushLayer.call(brush.move, null);
      refresh();
    });
  const brushLayer = A.svg.append("g").call(brush).lower();

  const rowHeight = 17, top = 30, bottom = 30, bandGap = 20;
  const bHeight = top + bottom + rowHeight * teams.length + bandGap * BANDS.length;

  {
    const sortOptions = {
      "Team win%": (d) => d.win_pct,
      "Best player PER": (d) => d.best_per,
      "On − off gap": (d) => gap(d),
    };
    const select = panelB.select(".subtitle").append("label").text(" Sort:").append("select");
    select.selectAll("option").data(Object.keys(sortOptions)).join("option").text((key) => key);

    const labelWidth = 150;
    const maxGap = d3.max(teams, (d) => Math.abs(gap(d)));
    const x = d3.scaleLinear([-maxGap, maxGap], [labelWidth, halfWidth - 10]).nice();
    const band = (d) => BANDS.indexOf(d.seed_band);

    let rowY = new Map();
    function sortRows(key) {
      const sorted = d3.sort(teams, band, (d) => -sortOptions[key](d));
      rowY = new Map(sorted.map((d, i) => [d.team, top + i * rowHeight + (band(d) + 1) * bandGap]));
    }
    sortRows("Team win%");

    const svg = panelB.append("svg").attr("width", halfWidth).attr("height", bHeight)
      .on("click", clearSelection);
    svg.append("g").attr("transform", `translate(0,${bHeight - bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((v) => (v === 0 ? "0" : d3.format("+.0%")(v)))
        .tickSize(-(bHeight - top - bottom)));
    svg.append("line").attr("class", "zero")
      .attr("x1", x(0)).attr("x2", x(0)).attr("y1", top).attr("y2", bHeight - bottom);
    svg.append("text").attr("class", "axis-title").attr("x", x(0) - 6).attr("y", 12)
      .attr("text-anchor", "end").text("◀ Worse with star on");
    svg.append("text").attr("class", "axis-title").attr("x", x(0) + 6).attr("y", 12)
      .text("Better with star on ▶");

    BANDS.forEach((name, i) => {
      const before = teams.filter((d) => band(d) < i).length;
      svg.append("text").attr("class", "band-label")
        .attr("x", 0).attr("y", top + before * rowHeight + (i + 1) * bandGap - 6).text(name);
    });

    const rows = svg.append("g").selectAll("g").data(teams).join("g")
      .attr("class", "team mark")
      .attr("transform", (d) => `translate(0,${rowY.get(d.team)})`);
    rows.append("rect").attr("class", "hit").attr("width", halfWidth).attr("height", rowHeight);
    rows.append("rect").attr("class", "bar").attr("fill", (d) => color(d.conference))
      .attr("x", (d) => Math.min(x(0), x(gap(d)))).attr("width", (d) => Math.abs(x(gap(d)) - x(0)))
      .attr("y", 2).attr("height", rowHeight - 4);
    const labels = rows.append("text").attr("x", 10).attr("y", rowHeight / 2).attr("dy", "0.35em");
    labels.append("tspan").attr("font-weight", 700).text((d) => d.team + " ");
    labels.append("tspan").attr("fill", "#888").text((d) => lastName(d.best_player));
    addInteractions(rows, true);

    select.on("change", (event) => {
      sortRows(event.target.value);
      rows.transition().duration(600).attr("transform", (d) => `translate(0,${rowY.get(d.team)})`);
    });
  }

  const C = scatter(panelC, {
    w: halfWidth, h: bHeight,
    xValue: (d) => d.roster_per, xTitle: "Roster PER without the star (minutes-weighted)",
    radius: () => 5, photo: false,
  });
  C.svg.on("click", clearSelection);

  return root.node();
}

function gap(d) {
  return d.tm8_efg_on - d.tm8_efg_off;
}

function placeLabels(dots, maxX, width = 20, height = 10) {
  const boxes = new Map();
  const hitsDot = (b, dot) => {
    const nx = Math.max(b.x, Math.min(dot.cx, b.x + width));
    const ny = Math.max(b.y, Math.min(dot.cy, b.y + height));
    return Math.hypot(dot.cx - nx, dot.cy - ny) < dot.r;
  };
  const hitsBox = (a, b) => Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < height;
  for (const {team, cx, cy, r} of dots) {
    const options = [
      {x: cx + r + 3, y: cy - height / 2},
      {x: cx - r - 3 - width, y: cy - height / 2},
      {x: cx - width / 2, y: cy - r - height - 1},
      {x: cx - width / 2, y: cy + r + 1},
    ];
    const cost = (b) => (b.x + width > maxX ? 100 : 0)
      + dots.filter((dot) => hitsDot(b, dot)).length
      + [...boxes.values()].filter((other) => hitsBox(b, other)).length;
    boxes.set(team, d3.least(options, cost));
  }
  return boxes;
}

function panel(parent, title, subtitle) {
  const section = parent.append("section").attr("class", "panel");
  section.append("h2").text(title);
  section.append("p").attr("class", "subtitle").text(subtitle);
  return section;
}

function referenceLine(svg, x1, x2, y1, y2, label) {
  svg.append("line").attr("class", "reference").attr("x1", x1).attr("x2", x2).attr("y1", y1).attr("y2", y2);
  svg.append("text").attr("class", "reference-label").attr("x", x2 + 4).attr("y", y1 + 10).text(label);
}

function linearFit(data, xValue, yValue) {
  const mx = d3.mean(data, xValue), my = d3.mean(data, yValue);
  let sxy = 0, sxx = 0, syy = 0;
  for (const d of data) {
    const dx = xValue(d) - mx, dy = yValue(d) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  return {r: sxy / Math.sqrt(sxx * syy), predict: (x) => my + slope * (x - mx)};
}
