/**
 * Canvas renderer for EQ map lines and label points.
 */
const EQLMapRenderer = (() => {
  const LABEL_HIT_RADIUS = 14;
  const LINE_HIT_RADIUS = 8;
  const LABEL_LAYERS = ["base", 1, 2, 3];
  const LABEL_DRAW_ORDER = [3, 2, 1, "base"];

  function isLayerVisible(visibleLayers, layer) {
    return layer === "base" ? visibleLayers.base : visibleLayers[layer];
  }

  function collectBounds(baseLines, labelLayers) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visit = (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const line of baseLines) {
      visit(line.x1, line.y1);
      visit(line.x2, line.y2);
    }
    for (const layer of LABEL_LAYERS) {
      for (const point of labelLayers[layer] || []) {
        visit(point.x, point.y);
      }
    }

    if (!Number.isFinite(minX)) {
      return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    }
    return { minX, minY, maxX, maxY };
  }

  function fitView(bounds, width, height, padding = 40) {
    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return {
      scale,
      offsetX: width / 2 - centerX * scale,
      offsetY: height / 2 - centerY * scale,
    };
  }

  function worldToScreen(view, x, y) {
    return {
      x: x * view.scale + view.offsetX,
      y: y * view.scale + view.offsetY,
    };
  }

  function screenToWorld(view, x, y) {
    return {
      x: (x - view.offsetX) / view.scale,
      y: (y - view.offsetY) / view.scale,
    };
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.hypot(px - x1, py - y1);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function snapToEndpoints(x, y, baseLines, threshold) {
    let bestX = x;
    let bestY = y;
    let bestDist = threshold;
    for (const line of baseLines) {
      for (const pt of [
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 },
      ]) {
        const dist = Math.hypot(pt.x - x, pt.y - y);
        if (dist < bestDist) {
          bestDist = dist;
          bestX = pt.x;
          bestY = pt.y;
        }
      }
    }
    return { x: bestX, y: bestY };
  }

  function draw(ctx, options) {
    const {
      width,
      height,
      view,
      baseLines,
      labelLayers,
      visibleLayers,
      selected,
      searchMatches,
      activeSearchIndex,
      bgTheme = "dark",
      linePreview = null,
      hoverWorld = null,
      activeTool = "pan",
    } = options;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle =
      bgTheme === "light" ? "#b8b8b8" : options.exportMode ? "#0c121c" : "rgba(12, 18, 28, 0.92)";
    ctx.fillRect(0, 0, width, height);

    if (visibleLayers.base) {
      for (const [index, line] of baseLines.entries()) {
        const a = worldToScreen(view, line.x1, line.y1);
        const b = worldToScreen(view, line.x2, line.y2);
        const isSelected = selected?.kind === "line" && selected.index === index;
        ctx.strokeStyle = `rgb(${line.r}, ${line.g}, ${line.b})`;
        ctx.lineWidth = isSelected ? Math.max(2.5, view.scale * 0.12) : Math.max(1, view.scale * 0.08);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (isSelected) {
          ctx.strokeStyle = "rgba(240, 208, 96, 0.85)";
          ctx.lineWidth = Math.max(3, view.scale * 0.14);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    if (linePreview?.points?.length && visibleLayers.base) {
      const pts = linePreview.points;
      ctx.strokeStyle = `rgb(${linePreview.r}, ${linePreview.g}, ${linePreview.b})`;
      ctx.lineWidth = Math.max(1.5, view.scale * 0.1);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const first = worldToScreen(view, pts[0].x, pts[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i += 1) {
        const p = worldToScreen(view, pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
      }
      if (hoverWorld) {
        const h = worldToScreen(view, hoverWorld.x, hoverWorld.y);
        ctx.lineTo(h.x, h.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const pt of pts) {
        const p = worldToScreen(view, pt.x, pt.y);
        ctx.fillStyle = "rgba(240, 208, 96, 0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (hoverWorld && options.activeTool === "line" && visibleLayers.base) {
      const h = worldToScreen(view, hoverWorld.x, hoverWorld.y);
      ctx.fillStyle = "rgba(240, 208, 96, 0.65)";
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const layer of LABEL_DRAW_ORDER) {
      if (!isLayerVisible(visibleLayers, layer)) {
        continue;
      }
      for (const [index, point] of (labelLayers[layer] || []).entries()) {
        const pos = worldToScreen(view, point.x, point.y);
        const isSelected =
          selected?.kind === "point" && selected.layer === layer && selected.index === index;
        const matchIndex = searchMatches.findIndex(
          (match) => match.layer === layer && match.index === index
        );
        const isSearchHit = matchIndex >= 0;
        const isActiveSearch = matchIndex === activeSearchIndex;

        ctx.font = `${Math.max(10, Math.min(14, view.scale * 0.55))}px "Source Sans 3", sans-serif`;
        const text = point.text.replace(/_/g, " ");
        const metrics = ctx.measureText(text);
        const padX = 4;
        const padY = 2;
        const boxW = metrics.width + padX * 2;
        const boxH = 14 + padY * 2;

        if (isSelected || isActiveSearch) {
          ctx.fillStyle = isActiveSearch
            ? "rgba(240, 208, 96, 0.35)"
            : "rgba(201, 162, 39, 0.28)";
          ctx.strokeStyle = "rgba(240, 208, 96, 0.85)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(pos.x - boxW / 2, pos.y - boxH / 2, boxW, boxH, 4);
          ctx.fill();
          ctx.stroke();
        } else if (isSearchHit) {
          ctx.fillStyle = "rgba(201, 162, 39, 0.18)";
          ctx.beginPath();
          ctx.roundRect(pos.x - boxW / 2, pos.y - boxH / 2, boxW, boxH, 4);
          ctx.fill();
        }

        ctx.fillStyle = `rgb(${point.r}, ${point.g}, ${point.b})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pos.x, pos.y);
      }
    }

    if (options.exportMode) {
      const margin = Math.max(12, Math.round(width * 0.012));
      const fontSize = Math.max(14, Math.round(width * 0.014));
      ctx.font = `${fontSize}px "Source Sans 3", sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText("https://rari.github.io/eqlfinest/map-viewer/", width - margin, height - margin);
    }
  }

  function findPointHit(view, labelLayers, visibleLayers, screenX, screenY) {
    for (const layer of LABEL_DRAW_ORDER) {
      if (!isLayerVisible(visibleLayers, layer)) {
        continue;
      }
      const points = labelLayers[layer] || [];
      for (let index = points.length - 1; index >= 0; index -= 1) {
        const point = points[index];
        const pos = worldToScreen(view, point.x, point.y);
        const dx = screenX - pos.x;
        const dy = screenY - pos.y;
        if (Math.hypot(dx, dy) <= LABEL_HIT_RADIUS) {
          return { kind: "point", layer, index };
        }
      }
    }
    return null;
  }

  function findLineHit(view, baseLines, visibleLayers, screenX, screenY) {
    if (!visibleLayers.base) {
      return null;
    }
    const world = screenToWorld(view, screenX, screenY);
    const threshold = LINE_HIT_RADIUS / view.scale;
    let best = null;
    let bestDist = threshold;
    for (let index = baseLines.length - 1; index >= 0; index -= 1) {
      const line = baseLines[index];
      const dist = distToSegment(world.x, world.y, line.x1, line.y1, line.x2, line.y2);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: "line", index };
      }
    }
    return best;
  }

  function findHit(view, baseLines, labelLayers, visibleLayers, screenX, screenY) {
    return (
      findPointHit(view, labelLayers, visibleLayers, screenX, screenY) ||
      findLineHit(view, baseLines, visibleLayers, screenX, screenY)
    );
  }

  function searchLabels(labelLayers, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const matches = [];
    for (const layer of LABEL_LAYERS) {
      for (const [index, point] of (labelLayers[layer] || []).entries()) {
        if (point.text.toLowerCase().includes(needle)) {
          matches.push({ layer, index, point });
        }
      }
    }
    return matches;
  }

  return {
    collectBounds,
    fitView,
    worldToScreen,
    screenToWorld,
    distToSegment,
    snapToEndpoints,
    draw,
    findPointHit,
    findLineHit,
    findHit,
    searchLabels,
  };
})();

if (typeof window !== "undefined") {
  window.EQLMapRenderer = EQLMapRenderer;
}
