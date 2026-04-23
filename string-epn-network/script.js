const STRING_EPN_FILES = [
  "../stringEPN.tsv",
  "../stringEPNproteinannotations.tsv",
  "../stringEPN_network_coordinates.tsv",
];

const CATEGORY_STYLES = {
  "Cilios / IFT": "#2f8f83",
  "Motores ciliares": "#4c78a8",
  "Sinalizacao": "#d37254",
  "Adesao / estrutura": "#8a6ccf",
  "Transporte / membrana": "#4b9e51",
  "Estresse / apoptose": "#ca6f9f",
  "Outros": "#8b98a8",
};

const elements = {
  cy: document.getElementById("cy"),
  datasetSummary: document.getElementById("dataset-summary"),
  loadStatus: document.getElementById("load-status"),
  scoreFilter: document.getElementById("score-filter"),
  scoreValue: document.getElementById("score-value"),
  scoreHint: document.getElementById("score-hint"),
  nodeDetails: document.getElementById("node-details"),
  networkStats: document.getElementById("network-stats"),
  legend: document.getElementById("legend"),
  goBack: document.getElementById("go-back"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  fitNetwork: document.getElementById("fit-network"),
  resetView: document.getElementById("reset-view"),
  runLayout: document.getElementById("run-layout"),
  exportImage: document.getElementById("export-image"),
};

const state = {
  files: [],
  nodes: [],
  edges: [],
  cy: null,
  minScore: 0,
  maxScore: 1,
  threshold: 0,
};

const networkLayoutOptions = {
  name: "cose",
  fit: true,
  animate: false,
  padding: 70,
  nodeRepulsion: 220000,
  idealEdgeLength: 180,
  edgeElasticity: 80,
  nodeOverlap: 40,
  componentSpacing: 140,
  gravity: 0.2,
  numIter: 1800,
};

const normalizeHeader = (value) => (
  value
    .replace(/^\uFEFF/, "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase()
);

const parseTsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rawHeaders = (lines.shift() || "").split("\t");
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, "").trim());
  const normalizedHeaders = headers.map(normalizeHeader);

  const rows = lines.map((line) => {
    const values = line.split("\t");
    const row = {};
    normalizedHeaders.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    return row;
  });

  return { headers, normalizedHeaders, rows };
};

const classifyDataset = ({ path, dataset }) => {
  const headers = new Set(dataset.normalizedHeaders);

  if (headers.has("node1") && headers.has("node2")) {
    return { type: "edges", path, dataset };
  }

  if (headers.has("x_position") && headers.has("y_position")) {
    return { type: "coordinates", path, dataset };
  }

  if (headers.has("annotation") && headers.has("identifier")) {
    return { type: "annotations", path, dataset };
  }

  return { type: "unknown", path, dataset };
};

const inferCategory = (annotation = "") => {
  const text = annotation.toLowerCase();

  if (/(cili|flagell|intraflagellar|transition zone|axoneme|axonemal)/.test(text)) {
    return "Cilios / IFT";
  }

  if (/(dynein|motor protein|microtubule)/.test(text)) {
    return "Motores ciliares";
  }

  if (/(kinase|receptor|signal|phosph|growth factor)/.test(text)) {
    return "Sinalizacao";
  }

  if (/(adhesion|junction|cytoskeletal|armadillo|epithelial|coiled-coil|scaffold)/.test(text)) {
    return "Adesao / estrutura";
  }

  if (/(transport|transporter|membrane|mitochond|channel|atp-binding)/.test(text)) {
    return "Transporte / membrana";
  }

  if (/(death|apopt|stress|ubiquitin|degradation)/.test(text)) {
    return "Estresse / apoptose";
  }

  return "Outros";
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadDatasets = async () => {
  const responses = await Promise.all(
    STRING_EPN_FILES.map(async (path) => {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`Nao foi possivel carregar ${path}`);
      }

      return {
        path,
        dataset: parseTsv(await response.text()),
      };
    })
  );

  return responses.map(classifyDataset);
};

const buildNetwork = (classifiedFiles) => {
  const edgeFile = classifiedFiles.find((file) => file.type === "edges");
  const annotationFile = classifiedFiles.find((file) => file.type === "annotations");
  const coordinatesFile = classifiedFiles.find((file) => file.type === "coordinates");

  if (!edgeFile) {
    throw new Error("Nenhum arquivo de interacoes foi detectado entre os arquivos stringEPN*.");
  }

  const annotationsByNode = new Map(
    (annotationFile?.dataset.rows || []).map((row) => [
      row.node,
      {
        identifier: row.identifier || "",
        annotation: row.annotation || "",
        aliases: row.other_names_and_aliases || "",
      },
    ])
  );

  const coordinatesByNode = new Map(
    (coordinatesFile?.dataset.rows || []).map((row) => [
      row.node,
      {
        identifier: row.identifier || "",
        x: toNumber(row.x_position, Math.random()),
        y: toNumber(row.y_position, Math.random()),
        stringColor: row.color || "",
        annotation: row.annotation || "",
      },
    ])
  );

  const edgeRows = edgeFile.dataset.rows.map((row, index) => ({
    id: `edge-${index}`,
    source: row.node1,
    target: row.node2,
    combinedScore: toNumber(row.combined_score, 0),
    evidence: {
      coexpression: toNumber(row.coexpression, 0),
      experimental: toNumber(row.experimentally_determined_interaction, 0),
      database: toNumber(row.database_annotated, 0),
      textMining: toNumber(row.automated_textmining, 0),
      homology: toNumber(row.homology, 0),
      fusion: toNumber(row.gene_fusion, 0),
      neighborhood: toNumber(row.neighborhood_on_chromosome, 0),
      cooccurrence: toNumber(row.phylogenetic_cooccurrence, 0),
    },
  }));

  const nodeIds = new Set(edgeRows.flatMap((edge) => [edge.source, edge.target]));
  const degreeByNode = new Map();

  nodeIds.forEach((nodeId) => degreeByNode.set(nodeId, 0));
  edgeRows.forEach((edge) => {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) || 0) + 1);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) || 0) + 1);
  });

  const degreeValues = [...degreeByNode.values()].sort((a, b) => b - a);
  const hubCutoff = degreeValues[Math.max(0, Math.ceil(degreeValues.length * 0.15) - 1)] || 0;

  const nodes = [...nodeIds].map((id) => {
    const annotationMeta = annotationsByNode.get(id) || {};
    const coordinateMeta = coordinatesByNode.get(id) || {};
    const annotation = annotationMeta.annotation || coordinateMeta.annotation || "";
    const category = inferCategory(annotation);
    const degree = degreeByNode.get(id) || 0;

    return {
      id,
      label: id,
      identifier: annotationMeta.identifier || coordinateMeta.identifier || "",
      annotation,
      aliases: annotationMeta.aliases || "",
      category,
      categoryColor: CATEGORY_STYLES[category],
      stringColor: coordinateMeta.stringColor || "",
      degree,
      isHub: degree >= hubCutoff && degree > 1,
      position: {
        x: coordinateMeta.x * 1200,
        y: coordinateMeta.y * 900,
      },
    };
  });

  return {
    nodes,
    edges: edgeRows,
    filesUsed: classifiedFiles.filter((file) => file.type !== "unknown"),
  };
};

const createLegend = () => {
  elements.legend.innerHTML = "";

  Object.entries(CATEGORY_STYLES).forEach(([label, color]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span>${label}</span>
    `;
    elements.legend.appendChild(item);
  });
};

const createCytoscapeElements = (nodes, edges) => {
  const cyNodes = nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      identifier: node.identifier,
      annotation: node.annotation,
      aliases: node.aliases,
      category: node.category,
      color: node.categoryColor,
      stringColor: node.stringColor,
      degree: node.degree,
      isHub: node.isHub ? 1 : 0,
      size: 24 + node.degree * 3.5,
    },
    position: node.position,
    classes: node.isHub ? "hub" : "",
  }));

  const cyEdges = edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      combinedScore: edge.combinedScore,
      label: edge.combinedScore.toFixed(3),
      coexpression: edge.evidence.coexpression,
      experimental: edge.evidence.experimental,
      database: edge.evidence.database,
      textMining: edge.evidence.textMining,
      homology: edge.evidence.homology,
      fusion: edge.evidence.fusion,
      neighborhood: edge.evidence.neighborhood,
      cooccurrence: edge.evidence.cooccurrence,
    },
  }));

  return [...cyNodes, ...cyEdges];
};

const renderStats = (visibleNodes, visibleEdges) => {
  const hubCount = visibleNodes.filter((node) => node.data("isHub") === 1).length;

  elements.networkStats.innerHTML = `
    <div class="stat-card">
      <strong>${visibleNodes.length}</strong>
      <span>nos visiveis</span>
    </div>
    <div class="stat-card">
      <strong>${visibleEdges.length}</strong>
      <span>arestas visiveis</span>
    </div>
    <div class="stat-card">
      <strong>${hubCount}</strong>
      <span>hubs destacados</span>
    </div>
    <div class="stat-card">
      <strong>${state.files.length}</strong>
      <span>arquivos integrados</span>
    </div>
  `;
};

const strongestEvidence = (edgeData) => {
  const evidence = [
    ["experimental", edgeData.experimental],
    ["database", edgeData.database],
    ["coexpression", edgeData.coexpression],
    ["text mining", edgeData.textMining],
    ["homology", edgeData.homology],
    ["fusion", edgeData.fusion],
    ["neighborhood", edgeData.neighborhood],
    ["cooccurrence", edgeData.cooccurrence],
  ];

  evidence.sort((first, second) => second[1] - first[1]);
  const [label, value] = evidence[0];
  return `${label}: ${value.toFixed(3)}`;
};

const renderNodeDetails = (node) => {
  if (!node) {
    elements.nodeDetails.innerHTML = "<p>Selecione um no para ver descricao, aliases, grau de conectividade e evidencias das interacoes.</p>";
    return;
  }

  const neighborhood = node.connectedEdges(":visible")
    .sort((first, second) => second.data("combinedScore") - first.data("combinedScore"))
    .slice(0, 5);

  const aliases = (node.data("aliases") || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean)
    .slice(0, 12);

  const topInteractions = neighborhood.length
    ? neighborhood.map((edge) => {
        const source = edge.data("source");
        const target = edge.data("target");
        const partner = source === node.id() ? target : source;
        return `
          <div class="detail-block">
            <strong>${partner}</strong>
            <div>Score combinado: ${edge.data("combinedScore").toFixed(3)}</div>
            <div>Melhor evidencia: ${strongestEvidence(edge.data())}</div>
          </div>
        `;
      }).join("")
    : '<div class="detail-block">Nenhuma interacao acima do filtro atual.</div>';

  elements.nodeDetails.innerHTML = `
    <div class="detail-block">
      <strong>${node.data("label")}</strong>
      <div class="tag-row">
        <span class="tag">${node.data("category")}</span>
        ${node.data("isHub") === 1 ? '<span class="tag hub">Hub</span>' : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-block">
        <strong>Identificador STRING</strong>
        <div>${node.data("identifier") || "Nao informado"}</div>
      </div>
      <div class="detail-block">
        <strong>Grau</strong>
        <div>${node.degree(false)}</div>
      </div>
    </div>
    <div class="detail-block">
      <strong>Anotacao</strong>
      <div>${node.data("annotation") || "Sem anotacao disponivel."}</div>
    </div>
    <div class="detail-block">
      <strong>Aliases</strong>
      <div>${aliases.length ? aliases.join(", ") : "Sem aliases adicionais."}</div>
    </div>
    <div class="node-details">
      <strong>Interacoes mais fortes no filtro atual</strong>
      ${topInteractions}
    </div>
  `;
};

const applyScoreFilter = () => {
  if (!state.cy) {
    return;
  }

  const threshold = toNumber(elements.scoreFilter.value, state.minScore);
  state.threshold = threshold;

  elements.scoreValue.textContent = threshold.toFixed(2);
  elements.scoreHint.textContent = threshold > state.minScore
    ? "A rede mostra apenas interacoes com score combinado acima do limiar."
    : "Mostrando todas as interacoes disponiveis.";

  state.cy.batch(() => {
    state.cy.edges().forEach((edge) => {
      edge.style("display", edge.data("combinedScore") >= threshold ? "element" : "none");
    });

    state.cy.nodes().forEach((node) => {
      const hasVisibleEdges = node.connectedEdges(":visible").length > 0;
      node.style("display", hasVisibleEdges ? "element" : "none");
    });
  });

  const visibleNodes = state.cy.nodes(":visible");
  const visibleEdges = state.cy.edges(":visible");
  renderStats(visibleNodes, visibleEdges);

  if (state.cy.$(":selected").empty()) {
    renderNodeDetails(null);
  } else {
    renderNodeDetails(state.cy.$(":selected").first());
  }

  state.cy.fit(visibleNodes, 40);
};

const initializeCytoscape = () => {
  state.cy = cytoscape({
    container: elements.cy,
    elements: createCytoscapeElements(state.nodes, state.edges),
    layout: networkLayoutOptions,
    style: [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          "border-color": "data(stringColor)",
          "border-width": 3,
          width: "data(size)",
          height: "data(size)",
          label: "data(label)",
          color: "#182337",
          "font-size": 11,
          "font-weight": 700,
          "text-wrap": "wrap",
          "text-max-width": 84,
          "text-valign": "bottom",
          "text-margin-y": 8,
          "overlay-padding": 6,
          "overlay-opacity": 0,
        },
      },
      {
        selector: "node.hub",
        style: {
          "border-color": "#f08c66",
          "border-width": 5,
          "shadow-blur": 18,
          "shadow-color": "rgba(240,140,102,0.35)",
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,
          "shadow-opacity": 1,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-color": "#182337",
          "border-width": 5,
        },
      },
      {
        selector: "edge",
        style: {
          width: "mapData(combinedScore, 0, 1, 1.5, 7)",
          "line-color": "#7fb7a6",
          opacity: "mapData(combinedScore, 0, 1, 0.25, 0.92)",
          "curve-style": "bezier",
        },
      },
      {
        selector: "edge:selected",
        style: {
          "line-color": "#182337",
          opacity: 1,
        },
      },
    ],
    wheelSensitivity: 0.18,
  });

  state.cy.on("tap", "node", (event) => {
    renderNodeDetails(event.target);
  });

  state.cy.on("tap", (event) => {
    if (event.target === state.cy) {
      state.cy.elements().unselect();
      renderNodeDetails(null);
    }
  });

  renderStats(state.cy.nodes(), state.cy.edges());
};

const resetView = () => {
  elements.scoreFilter.value = state.minScore.toFixed(2);
  applyScoreFilter();
  state.cy.layout({ ...networkLayoutOptions, animate: true }).run();
};

const runLayout = () => {
  if (!state.cy) {
    return;
  }

  state.cy.layout({
    ...networkLayoutOptions,
    animate: true,
  }).run();
};

const exportImage = () => {
  if (!state.cy) {
    return;
  }

  const image = state.cy.png({
    full: true,
    scale: 2,
    bg: "#ffffff",
  });

  const link = document.createElement("a");
  link.href = image;
  link.download = "rede-epn-string.png";
  link.click();
};

const zoomBy = (factor) => {
  if (!state.cy) {
    return;
  }

  const currentZoom = state.cy.zoom();
  const nextZoom = Math.min(3.5, Math.max(0.15, currentZoom * factor));

  state.cy.zoom({
    level: nextZoom,
    renderedPosition: {
      x: state.cy.width() / 2,
      y: state.cy.height() / 2,
    },
  });
};

const fitNetwork = () => {
  if (!state.cy) {
    return;
  }

  state.cy.fit(state.cy.nodes(":visible"), 50);
};

const goBack = () => {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = "../tratamento-analise-estatistica.html";
};

const bindEvents = () => {
  elements.goBack.addEventListener("click", goBack);
  elements.zoomIn.addEventListener("click", () => zoomBy(1.2));
  elements.zoomOut.addEventListener("click", () => zoomBy(1 / 1.2));
  elements.fitNetwork.addEventListener("click", fitNetwork);
  elements.scoreFilter.addEventListener("input", applyScoreFilter);
  elements.resetView.addEventListener("click", resetView);
  elements.runLayout.addEventListener("click", runLayout);
  elements.exportImage.addEventListener("click", exportImage);
};

const initialize = async () => {
  try {
    elements.loadStatus.textContent = "Carregando";
    const classifiedFiles = await loadDatasets();
    const filesUsed = classifiedFiles.filter((file) => file.type !== "unknown");

    state.files = filesUsed;

    const network = buildNetwork(classifiedFiles);
    state.nodes = network.nodes;
    state.edges = network.edges;

    const scores = state.edges.map((edge) => edge.combinedScore);
    state.minScore = Math.min(...scores);
    state.maxScore = Math.max(...scores);

    elements.scoreFilter.min = state.minScore.toFixed(2);
    elements.scoreFilter.max = state.maxScore.toFixed(2);
    elements.scoreFilter.value = state.minScore.toFixed(2);
    elements.datasetSummary.textContent = `${state.nodes.length} proteinas e ${state.edges.length} interacoes integradas de ${filesUsed.length} arquivo(s) stringEPN* detectados automaticamente no projeto.`;

    createLegend();
    initializeCytoscape();
    bindEvents();
    applyScoreFilter();

    elements.loadStatus.textContent = "Pronto";
  } catch (error) {
    elements.loadStatus.textContent = "Erro";
    elements.datasetSummary.textContent = error.message;
    elements.nodeDetails.innerHTML = `
      <div class="detail-block">
        <strong>Falha ao carregar os arquivos</strong>
        <div>${error.message}</div>
        <div>Abra esta pagina por um servidor local simples para permitir o carregamento dos arquivos TSV.</div>
      </div>
    `;
  }
};

initialize();
