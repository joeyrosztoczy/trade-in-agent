(function () {
  const data = window.TradeReviewDemoData;
  const app = document.getElementById("app");
  let selectedId = data.cases[0].id;
  let activeFilter = "all";

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }

  function toneForRisk(risk) {
    if (risk === "low") return "good";
    if (risk === "medium") return "watch";
    return "risk";
  }

  function filteredCases() {
    if (activeFilter === "all") return data.cases;
    return data.cases.filter((item) => item.risk === activeFilter || item.route.toLowerCase().includes(activeFilter));
  }

  function selectedCase() {
    return data.cases.find((item) => item.id === selectedId) || data.cases[0];
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function riskChip(risk) {
    return `<span class="ti-risk" data-risk="${escapeHtml(risk)}"><span class="ti-dot"></span>${escapeHtml(risk)}</span>`;
  }

  function badge(value, tone) {
    return `<span class="ti-badge" data-tone="${escapeHtml(tone)}">${escapeHtml(value)}</span>`;
  }

  function meter(value, tone) {
    const color = tone === "high"
      ? "var(--ti-color-risk-high)"
      : tone === "medium"
        ? "var(--ti-color-risk-medium)"
        : "var(--ti-color-risk-low)";
    return `
      <div class="ti-meter" style="--meter-value:${Number(value)}%; --meter-color:${color}">
        <div class="ti-meter__track"><div class="ti-meter__fill"></div></div>
        <div class="ti-meter__value">${escapeHtml(value)}</div>
      </div>
    `;
  }

  function renderTopbar() {
    return `
      <header class="ti-topbar">
        <div class="ti-brand">
          <div class="ti-brand__mark">P</div>
          <div>
            <span class="ti-brand__name">Premier / Stotz Used Equipment</span>
            <span class="ti-brand__meta">Trade Desk / Review Ops</span>
          </div>
        </div>
        <nav class="ti-nav" aria-label="Review navigation">
          <a class="ti-nav__item" aria-current="page" href="#">Trade Queue</a>
          <a class="ti-nav__item" href="#">Evidence</a>
          <a class="ti-nav__item" href="#">Valuations</a>
          <a class="ti-nav__item" href="#">Recon</a>
          <a class="ti-nav__item" href="#">Inventory</a>
        </nav>
        <div class="ti-topbar__right">
          ${badge(data.user.period, "info")}
          <span>${escapeHtml(data.user.name)}</span>
          <div class="ti-avatar" aria-label="${escapeHtml(data.user.name)}">${escapeHtml(data.user.initials)}</div>
        </div>
      </header>
    `;
  }

  function renderPagehead() {
    return `
      <section class="ti-pagehead" aria-labelledby="review-title">
        <div>
          <div class="ti-eyebrow">Used Trade Review</div>
          <h1 id="review-title" class="ti-title">Open trade <em>review queue</em></h1>
        </div>
        <div class="ti-meta-list" aria-label="Queue metadata">
          <div class="ti-meta"><span class="ti-meta__label">Last sync</span><span class="ti-meta__value">${escapeHtml(data.summary.lastSync)}</span></div>
          <div class="ti-meta"><span class="ti-meta__label">Locations</span><span class="ti-meta__value">${escapeHtml(data.summary.locationsOnline)}</span></div>
          <div class="ti-meta"><span class="ti-meta__label">SLA breaches</span><span class="ti-meta__value">${escapeHtml(data.summary.slaBreaches)}</span></div>
        </div>
      </section>
    `;
  }

  function renderKpis() {
    return `
      <section class="ti-kpis" aria-label="Queue summary">
        ${data.summary.kpis.map((kpi) => `
          <div class="ti-kpi">
            <div class="ti-kpi__label">${escapeHtml(kpi.label)}</div>
            <div class="ti-kpi__value">${escapeHtml(kpi.value)}${kpi.suffix ? `<small>${escapeHtml(kpi.suffix)}</small>` : ""}</div>
            <div class="ti-delta" data-tone="${escapeHtml(kpi.tone)}">${escapeHtml(kpi.delta)}</div>
          </div>
        `).join("")}
      </section>
    `;
  }

  function renderFilters() {
    const filters = [
      ["all", "All"],
      ["high", "High risk"],
      ["medium", "Medium"],
      ["fast path", "Fast path"]
    ];

    return filters.map(([value, label]) => `
      <button class="ti-button" type="button" data-filter="${escapeHtml(value)}" aria-pressed="${activeFilter === value}">
        ${escapeHtml(label)}
      </button>
    `).join("");
  }

  function renderQueue() {
    const rows = filteredCases().map((item) => `
      <button class="case-row" type="button" data-case-id="${escapeHtml(item.id)}" aria-selected="${item.id === selectedId}">
        <span class="case-id">${escapeHtml(item.caseNumber)}</span>
        <span class="unit-cell">
          <span class="unit-cell__model">${escapeHtml(item.unit)} - ${escapeHtml(item.modelYear)}</span>
          <span class="unit-cell__meta">SN ${escapeHtml(item.serial)}</span>
        </span>
        <span class="customer-cell">
          <span class="customer-cell__org">${escapeHtml(item.customer)}</span>
          <span class="customer-cell__loc">${escapeHtml(item.location)}</span>
        </span>
        <span class="money-cell">${formatMoney(item.proposedTrade)}</span>
        <span>${riskChip(item.risk)}</span>
        <span class="stage-cell">${escapeHtml(item.stage)}</span>
        <span class="age-cell">${escapeHtml(item.age)}</span>
      </button>
    `).join("");

    return `
      <section class="review-queue" aria-labelledby="queue-title">
        <div class="ti-section-head">
          <h2 id="queue-title" class="ti-section-title">Tickets needing review</h2>
          <div class="ti-toolbar" aria-label="Queue filters">${renderFilters()}</div>
        </div>
        <div class="ti-panel">
          <div class="queue-head" aria-hidden="true">
            <div>Ticket</div>
            <div>Unit</div>
            <div>Customer</div>
            <div>Quoted</div>
            <div>Risk</div>
            <div>Stage</div>
            <div>Age</div>
          </div>
          ${rows || `<div class="summary-panel"><p class="summary-copy">No review tickets match this filter.</p></div>`}
        </div>
      </section>
    `;
  }

  function renderEvidence(item) {
    return `
      <div class="evidence-strip" aria-label="Evidence coverage">
        ${item.evidence.map((evidence) => `
          <div class="evidence-tile" data-status="${escapeHtml(evidence.status)}">
            <div class="evidence-tile__label">${escapeHtml(evidence.label)}</div>
            <div class="evidence-tile__meta">${escapeHtml(evidence.meta)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderDetail(item) {
    return `
      <aside aria-labelledby="detail-title">
        <section class="ti-panel">
          <div class="detail-panel__head">
            <span class="detail-panel__case">${escapeHtml(item.caseNumber)}</span>
            ${badge(item.route, toneForRisk(item.risk))}
          </div>
          <div class="detail-panel__body">
            <h2 id="detail-title" class="detail-title">${escapeHtml(item.unit)} - MY ${escapeHtml(item.modelYear)}</h2>
            <p class="detail-subtitle">SN ${escapeHtml(item.serial)} / ${escapeHtml(item.hours)} hrs / ${escapeHtml(item.type)}</p>

            <div class="spec-grid">
              ${item.specs.map(([label, value]) => `
                <div class="ti-field">
                  <span class="ti-label">${escapeHtml(label)}</span>
                  <span class="ti-value">${escapeHtml(value)}</span>
                </div>
              `).join("")}
            </div>

            <div class="value-block">
              <div>
                <div class="ti-label">Proposed trade allowance</div>
                <div class="value-block__amount"><span>$</span>${formatMoney(item.proposedTrade).replace("$", "")}</div>
              </div>
              <div class="range-track" style="--range-start:18%; --range-end:22%; --range-mark:${Math.min(85, Math.max(12, Math.round(((item.proposedTrade - item.lowValue) / (item.highValue - item.lowValue)) * 100)))}%">
                <div class="range-track__band"></div>
                <div class="range-track__mark"></div>
              </div>
              <div class="range-labels">
                <span>Low ${formatMoney(item.lowValue)}</span>
                <span>Recon ${formatMoney(item.reconBudget)}</span>
                <span>High ${formatMoney(item.highValue)}</span>
              </div>
            </div>

            <div class="signal-grid" aria-label="Risk factor breakdown">
              <div class="ti-label">Risk factor breakdown</div>
              ${item.riskFactors.map(([label, value, tone]) => `
                <div class="signal-row">
                  <span class="signal-row__name">${escapeHtml(label)}</span>
                  ${meter(value, tone)}
                </div>
              `).join("")}
            </div>

            ${renderEvidence(item)}

            <div class="review-lane" aria-label="Reviewer status">
              ${item.reviewLines.map((line) => `
                <div class="review-line">
                  <span class="review-line__label">${escapeHtml(line.label)}</span>
                  ${badge(line.value, line.tone)}
                </div>
              `).join("")}
            </div>
          </div>
          <div class="detail-actions">
            <button class="ti-button" type="button">Hold</button>
            <button class="ti-button" type="button">Request evidence</button>
            <button class="ti-button" data-variant="primary" type="button">Approve packet</button>
          </div>
        </section>

        <section class="ti-panel summary-panel" aria-labelledby="summary-title">
          <div class="ti-section-head">
            <h2 id="summary-title" class="ti-section-title">Reviewer readout</h2>
            ${badge(item.confidence + " confidence", toneForRisk(item.risk))}
          </div>
          <p class="summary-copy">${escapeHtml(item.summary)}</p>
        </section>
      </aside>
    `;
  }

  function render() {
    const item = selectedCase();
    app.innerHTML = `
      <div class="review-shell">
        ${renderTopbar()}
        ${renderPagehead()}
        ${renderKpis()}
        <main class="review-main">
          <div class="review-main__left">${renderQueue()}</div>
          <div class="review-main__right">${renderDetail(item)}</div>
        </main>
        <footer class="review-footnote">
          <span>Used Equipment Review Ops</span>
          <span>Premier / Stotz Trade Desk v0.1</span>
        </footer>
      </div>
    `;
  }

  app.addEventListener("click", (event) => {
    const caseButton = event.target.closest("[data-case-id]");
    if (caseButton) {
      selectedId = caseButton.dataset.caseId;
      render();
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      activeFilter = filterButton.dataset.filter;
      const visible = filteredCases();
      if (visible.length && !visible.some((item) => item.id === selectedId)) {
        selectedId = visible[0].id;
      }
      render();
    }
  });

  render();
})();
