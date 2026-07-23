/**
 * Client-side zone pathfinder (mirrors zone-pathfinder/pathfinder.py).
 * Loads bundled JSON and runs entirely offline for the mobile APK.
 */
const EQLPathfinder = (() => {
  const TRAVEL_FOOT = "foot";
  const TRAVEL_DRUID = "druid";
  const TRAVEL_WIZARD = "wizard";
  const VALID_ERAS = new Set(["classic", "kunark", "velious"]);

  let zoneGraph = null;
  let portsData = null;
  let boatsData = null;
  let eqlZonesData = null;
  let selectedEras = ["classic"];

  let allowedZones = null;
  let destinations = null;
  let destinationLabels = null;
  let destinationNodesByLabel = null;
  let searchAliases = null;
  let destinationLabelLookup = null;
  let boatEdgeKeys = null;
  let boatLabels = null;
  let portDestinations = null;
  let portSpellLookup = null;
  let adjacency = null;

  function normalizeEras(eras) {
    const values = Array.isArray(eras)
      ? eras
      : String(eras || "classic")
          .split(",")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);
    const selected = ["classic", "kunark", "velious"].filter((era) =>
      values.includes(era)
    );
    return selected.length ? selected : ["classic"];
  }

  function applyEras(eras) {
    selectedEras = normalizeEras(eras);
    const byEra = eqlZonesData.allowed_zones_by_era || {};
    allowedZones = new Set();
    for (const era of selectedEras) {
      for (const zone of byEra[era] || []) {
        allowedZones.add(zone);
      }
    }
    if (!allowedZones.size) {
      allowedZones = new Set(eqlZonesData.allowed_zones || []);
    }

    const eraSet = new Set(selectedEras);
    const seen = new Set();
    destinations = [];
    for (const entry of eqlZonesData.destinations || []) {
      if (!eraSet.has(entry.era || "classic") || seen.has(entry.label)) {
        continue;
      }
      seen.add(entry.label);
      destinations.push(entry);
    }
    destinationLabels = destinations
      .map((entry) => entry.label)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    destinationNodesByLabel = new Map(
      destinations.map((entry) => [entry.label, new Set(entry.nodes || [])])
    );

    const aliasesByEra = eqlZonesData.search_aliases_by_era || {};
    searchAliases = {};
    for (const era of selectedEras) {
      const eraAliases =
        aliasesByEra[era] ||
        (era === "classic" ? eqlZonesData.search_aliases || {} : {});
      Object.assign(searchAliases, eraAliases);
    }
    destinationLabelLookup = buildDestinationLabelLookup();
    portDestinations = buildPortDestinations();
    adjacency = buildAdjacency();
  }

  function canonicalName(zoneName) {
    return zoneGraph.aliases?.[zoneName] || zoneName;
  }

  function isRoutableNode(zoneName) {
    return allowedZones.has(canonicalName(zoneName));
  }

  function buildDestinationLabelLookup() {
    const lookup = new Map();

    function addAlias(alias, label) {
      const key = alias.trim().toLowerCase();
      if (key) {
        lookup.set(key, label);
      }
    }

    for (const label of destinationLabels) {
      addAlias(label, label);
      if (label.toLowerCase().startsWith("the ")) {
        addAlias(label.slice(4), label);
      } else {
        addAlias(`the ${label}`, label);
      }
    }

    for (const [alias, label] of Object.entries(searchAliases)) {
      addAlias(alias, label);
    }

    for (const [alias, target] of Object.entries(zoneGraph.aliases || {})) {
      for (const entry of destinations) {
        if ((entry.nodes || []).includes(target)) {
          addAlias(alias, entry.label);
        }
      }
    }

    for (const entry of destinations) {
      for (const node of entry.nodes || []) {
        addAlias(node, entry.label);
      }
    }

    return lookup;
  }

  function routeDockPairs(route) {
    if (Array.isArray(route.docks) && route.docks.length) {
      const names = route.docks.map((dock) => canonicalName(dock));
      const pairs = [];
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          pairs.push([names[i], names[j]]);
        }
      }
      return pairs;
    }
    if (route.from && route.to) {
      return [[canonicalName(route.from), canonicalName(route.to)]];
    }
    return [];
  }

  function buildBoatEdgeKeys() {
    const keys = new Set();
    for (const route of boatsData.routes) {
      for (const [a, b] of routeDockPairs(route)) {
        keys.add(boatKey(a, b));
      }
    }
    return keys;
  }

  function boatKey(a, b) {
    return [a, b].sort().join("\0");
  }

  function buildBoatLabels() {
    const labels = new Map();
    for (const route of boatsData.routes) {
      const name = route.name || "Naval Translocator";
      for (const [a, b] of routeDockPairs(route)) {
        const key = boatKey(a, b);
        if (!labels.has(key)) {
          labels.set(key, name);
        }
      }
    }
    return labels;
  }

  function buildPortDestinations() {
    const result = {
      [TRAVEL_DRUID]: new Set(),
      [TRAVEL_WIZARD]: new Set(),
    };

    for (const mode of [TRAVEL_DRUID, TRAVEL_WIZARD]) {
      const key = mode === TRAVEL_DRUID ? "druid" : "wizard";
      for (const entry of portsData[key]) {
        const zone = canonicalName(entry.zone);
        if (allowedZones.has(zone)) {
          result[mode].add(zone);
        }
      }
    }

    return result;
  }

  function buildPortSpellLookup() {
    const lookup = {
      [TRAVEL_DRUID]: new Map(),
      [TRAVEL_WIZARD]: new Map(),
    };

    for (const [mode, key] of [
      [TRAVEL_DRUID, "druid"],
      [TRAVEL_WIZARD, "wizard"],
    ]) {
      for (const entry of portsData[key]) {
        lookup[mode].set(canonicalName(entry.zone), entry.spell);
      }
    }

    return lookup;
  }

  function buildAdjacency() {
    const graph = zoneGraph;
    const adj = {};

    for (const name of Object.keys(graph.nodes)) {
      if (allowedZones.has(name)) {
        adj[name] = new Set();
      }
    }

    for (const edge of graph.edges) {
      const a = canonicalName(edge.from);
      const b = canonicalName(edge.to);
      if (!allowedZones.has(a) || !allowedZones.has(b)) {
        continue;
      }
      if (!adj[a]) adj[a] = new Set();
      if (!adj[b]) adj[b] = new Set();
      adj[a].add(b);
      adj[b].add(a);
    }

    // Naval translocator docks: any dock on a route reaches any other in one hop.
    for (const route of boatsData.routes) {
      for (const [a, b] of routeDockPairs(route)) {
        if (!allowedZones.has(a) || !allowedZones.has(b)) {
          continue;
        }
        if (!adj[a]) adj[a] = new Set();
        if (!adj[b]) adj[b] = new Set();
        adj[a].add(b);
        adj[b].add(a);
      }
    }

    return adj;
  }

  function resolveDestinationLabel(zoneName) {
    const cleaned = zoneName.trim();
    if (!cleaned) {
      return null;
    }
    return destinationLabelLookup.get(cleaned.toLowerCase()) || null;
  }

  function resolveDestinationNodes(zoneName) {
    const label = resolveDestinationLabel(zoneName);
    if (!label) {
      return null;
    }

    const nodes = destinationNodesByLabel.get(label) || new Set();
    const routable = new Set([...nodes].filter(isRoutableNode));
    return routable.size ? routable : null;
  }

  function edgeType(current, nxt, previous, mode) {
    if ((mode === TRAVEL_DRUID || mode === TRAVEL_WIZARD) && previous !== null) {
      const portSet = portDestinations[mode];
      const prevNeighbors = adjacency[previous] || new Set();
      if (portSet.has(nxt) && !prevNeighbors.has(nxt)) {
        return "port";
      }
    }

    if (boatEdgeKeys.has(boatKey(current, nxt))) {
      return "boat";
    }

    return "walk";
  }

  function reconstructPath(previous, end, mode) {
    const steps = [];
    let current = end;

    while (current !== null && current !== undefined) {
      const entry = previous[current];
      if (!entry) {
        break;
      }
      const [prev, stepType] = entry;
      if (prev !== null) {
        let label = "";
        if (stepType === "port") {
          label = portSpellLookup[mode].get(current) || "Port";
        } else if (stepType === "boat") {
          label = boatLabels.get(boatKey(prev, current)) || "Naval Translocator";
        }
        steps.push({ from: prev, to: current, type: stepType, label });
      }
      current = prev;
    }

    steps.reverse();
    return steps;
  }

  function shortestPath(start, end, mode = TRAVEL_FOOT) {
    const startNodes = resolveDestinationNodes(start);
    const endNodes = resolveDestinationNodes(end);
    const startLabel = resolveDestinationLabel(start) || start.trim();
    const endLabel = resolveDestinationLabel(end) || end.trim();

    if (!startNodes || !endNodes) {
      return null;
    }

    if (![TRAVEL_FOOT, TRAVEL_DRUID, TRAVEL_WIZARD].includes(mode)) {
      throw new Error(`Unknown travel mode: ${mode}`);
    }

    for (const node of startNodes) {
      if (endNodes.has(node)) {
        return {
          start: startLabel,
          end: endLabel,
          mode,
          era: selectedEras.join(","),
          hops: 0,
          steps: [],
          path: [node],
        };
      }
    }

    const portSet =
      mode === TRAVEL_DRUID || mode === TRAVEL_WIZARD
        ? portDestinations[mode]
        : new Set();

    const previous = {};
    const queue = [];

    for (const node of startNodes) {
      previous[node] = [null, "start"];
      queue.push(node);
    }

    while (queue.length) {
      const current = queue.shift();

      for (const endNode of endNodes) {
        if (current === endNode) {
          const steps = reconstructPath(previous, current, mode);
          const path = [];
          let node = current;
          while (node !== null && node !== undefined) {
            path.push(node);
            node = previous[node]?.[0] ?? null;
          }
          path.reverse();
          return {
            start: startLabel,
            end: endLabel,
            mode,
            era: selectedEras.join(","),
            hops: steps.length,
            steps,
            path,
          };
        }
      }

      const neighbors = new Set(adjacency[current] || []);
      if (portSet.size) {
        for (const zone of portSet) {
          neighbors.add(zone);
        }
      }

      for (const nxt of neighbors) {
        if (!allowedZones.has(nxt) || previous[nxt]) {
          continue;
        }
        const stepType = edgeType(current, nxt, current, mode);
        previous[nxt] = [current, stepType];
        queue.push(nxt);
      }
    }

    return null;
  }

  function searchZones(query, limit = 20) {
    const cleaned = query.trim().toLowerCase();
    const labels = [...destinationLabels];

    if (!cleaned) {
      return limit ? labels.slice(0, limit) : labels;
    }

    function score(label) {
      const folded = label.toLowerCase();
      if (folded === cleaned) return [0, label];
      if (folded.startsWith(cleaned)) return [1, label];
      const withoutThe = folded.startsWith("the ") ? folded.slice(4) : folded;
      const queryWithoutThe = cleaned.startsWith("the ")
        ? cleaned.slice(4)
        : cleaned;
      if (withoutThe === queryWithoutThe) return [0, label];
      if (withoutThe.startsWith(queryWithoutThe)) return [1, label];
      if (folded.includes(cleaned)) return [2, label];
      if (withoutThe.includes(queryWithoutThe)) return [3, label];
      return [99, label];
    }

    const matches = labels
      .map((label) => ({ label, rank: score(label) }))
      .filter((entry) => entry.rank[0] < 99)
      .sort((a, b) => {
        if (a.rank[0] !== b.rank[0]) return a.rank[0] - b.rank[0];
        return a.label.localeCompare(b.label);
      })
      .map((entry) => entry.label);

    return limit ? matches.slice(0, limit) : matches;
  }

  async function init() {
    const bust =
      (typeof document !== "undefined" &&
        document.body &&
        document.body.dataset &&
        document.body.dataset.build) ||
      "";
    const q = bust ? `?v=${encodeURIComponent(bust)}` : "";
    const dataUrl = (name) =>
      (typeof window !== "undefined" && window.EQLDom
        ? window.EQLDom.siteUrl(`data/traveler/${name}`)
        : `../data/traveler/${name}`) + q;
    const [graph, ports, boats, eqlZones] = await Promise.all([
      fetch(dataUrl("zone_graph.json")).then((r) => r.json()),
      fetch(dataUrl("ports.json")).then((r) => r.json()),
      fetch(dataUrl("boats.json")).then((r) => r.json()),
      fetch(dataUrl("eql_zones.json")).then((r) => r.json()),
    ]);

    zoneGraph = graph;
    portsData = ports;
    boatsData = boats;
    eqlZonesData = eqlZones;
    boatEdgeKeys = buildBoatEdgeKeys();
    boatLabels = buildBoatLabels();
    portSpellLookup = buildPortSpellLookup();
    applyEras(eqlZonesData.default_era || "classic");
  }

  return {
    TRAVEL_FOOT,
    TRAVEL_DRUID,
    TRAVEL_WIZARD,
    init,
    setEras(eras) {
      applyEras(eras);
    },
    setEra(era) {
      applyEras(era);
    },
    getEras() {
      return [...selectedEras];
    },
    getEra() {
      return selectedEras.join(",");
    },
    defaultEra() {
      return eqlZonesData?.default_era || "classic";
    },
    allZones: () => [...destinationLabels],
    shortestPath,
    searchZones,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.EQLPathfinder = EQLPathfinder;
}
