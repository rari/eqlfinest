/**
 * EverQuest Legends map file format.
 * Base: L x1,y1,z1, x2,y2,z2, r,g,b
 * Labels: P x,y,z, r,g,b, sublayer, text
 */
const EQLMapFormat = (() => {
  const LINE_RE =
    /^L\s+(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(\d+),\s*(\d+),\s*(\d+)\s*$/;
  const POINT_RE =
    /^P\s+(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(.+?)\s*$/;

  function parseLine(text) {
    const match = String(text || "").trim().match(LINE_RE);
    if (!match) {
      return null;
    }
    return {
      type: "line",
      x1: Number(match[1]),
      y1: Number(match[2]),
      z1: Number(match[3]),
      x2: Number(match[4]),
      y2: Number(match[5]),
      z2: Number(match[6]),
      r: Number(match[7]),
      g: Number(match[8]),
      b: Number(match[9]),
    };
  }

  function parsePoint(text) {
    const match = String(text || "").trim().match(POINT_RE);
    if (!match) {
      return null;
    }
    return {
      type: "point",
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
      r: Number(match[4]),
      g: Number(match[5]),
      b: Number(match[6]),
      sublayer: Number(match[7]),
      text: match[8].trim(),
    };
  }

  function parseFile(text) {
    const lines = [];
    const points = [];
    const errors = [];
    for (const [index, raw] of String(text || "").split(/\r?\n/).entries()) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const line = parseLine(trimmed);
      if (line) {
        lines.push(line);
        continue;
      }
      const point = parsePoint(trimmed);
      if (point) {
        points.push(point);
        continue;
      }
      errors.push({ line: index + 1, text: trimmed });
    }
    return { lines, points, errors };
  }

  function fmtNum(value) {
    const n = Number(value);
    if (Number.isInteger(n)) {
      return `${n}.0000`;
    }
    return n.toFixed(4);
  }

  function fmtPointNum(value) {
    const n = Number(value);
    if (Number.isInteger(n)) {
      return `${n}.0`;
    }
    return String(n);
  }

  function serializeLine(entry) {
    return `L ${fmtNum(entry.x1)}, ${fmtNum(entry.y1)}, ${fmtNum(entry.z1)},  ${fmtNum(entry.x2)}, ${fmtNum(entry.y2)}, ${fmtNum(entry.z2)},  ${entry.r}, ${entry.g}, ${entry.b}`;
  }

  function serializePoint(entry) {
    return `P ${fmtPointNum(entry.x)}, ${fmtPointNum(entry.y)}, ${fmtPointNum(entry.z)},  ${entry.r}, ${entry.g}, ${entry.b},  ${entry.sublayer},  ${entry.text}`;
  }

  function serializeBase(lines, points = []) {
    const chunks = [];
    if (lines.length) {
      chunks.push(...lines.map(serializeLine));
    }
    if (points.length) {
      chunks.push(...points.map(serializePoint));
    }
    if (!chunks.length) {
      return "";
    }
    return `${chunks.join("\n")}\n`;
  }

  function serializeLabels(points) {
    if (!points.length) {
      return "";
    }
    return `${points.map(serializePoint).join("\n")}\n`;
  }

  function stripMapSuffix(name) {
    return String(name || "map")
      .replace(/\.txt$/i, "")
      .replace(/_\d+$/, "");
  }

  function labelFileName(baseName, layer) {
    return `${baseName}_${layer}.txt`;
  }

  return {
    parseLine,
    parsePoint,
    parseFile,
    serializeLine,
    serializePoint,
    serializeBase,
    serializeLabels,
    stripMapSuffix,
    labelFileName,
  };
})();

if (typeof window !== "undefined") {
  window.EQLMapFormat = EQLMapFormat;
}

if (typeof module !== "undefined") {
  module.exports = EQLMapFormat;
}
