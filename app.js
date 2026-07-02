/*
 * Drone Ortho XYZ Viewer
 * ----------------------
 * サーバー不要・APIキー不要で動く、研究室向けの軽量Web GISです。
 * このファイルでは、MapLibreの初期化、XYZタイル追加、レイヤー管理、
 * GeoJSON表示、URL共有をすべて扱います。
 */

const DEFAULT_VIEW = {
  center: [138.2529, 36.2048],
  zoom: 4.6,
};

const BACKGROUND_SOURCES = {
  "gsi-standard": {
    name: "地理院標準地図",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    maxzoom: 18,
  },
  "gsi-photo": {
    name: "地理院航空写真",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    maxzoom: 18,
  },
  osm: {
    name: "OpenStreetMap",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    maxzoom: 19,
  },
};

const els = {
  basemapSelect: document.getElementById("basemap-select"),
  xyzName: document.getElementById("xyz-name"),
  xyzUrl: document.getElementById("xyz-url"),
  addXyzButton: document.getElementById("add-xyz-button"),
  message: document.getElementById("message"),
  layerList: document.getElementById("layer-list"),
  layerCount: document.getElementById("layer-count"),
  dropZone: document.getElementById("drop-zone"),
  geojsonFile: document.getElementById("geojson-file"),
  chooseGeojsonButton: document.getElementById("choose-geojson-button"),
  shareButton: document.getElementById("share-button"),
  shareUrl: document.getElementById("share-url"),
};

let map;
let activeBasemapId = "gsi-standard";
let rasterLayerSequence = 1;
let geojsonLayerSequence = 1;
let popup;

const rasterLayers = [];
const geojsonLayers = [];
const htmlTileOverlays = new Map();

init();

function init() {
  const restoredState = readStateFromUrl();

  activeBasemapId = restoredState.basemap || activeBasemapId;
  els.basemapSelect.value = activeBasemapId;

  map = new maplibregl.Map({
    container: "map",
    style: buildStyle(activeBasemapId),
    center: restoredState.center || DEFAULT_VIEW.center,
    zoom: restoredState.zoom || DEFAULT_VIEW.zoom,
    hash: false,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: "metric" }));

  popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true });

  bindUiEvents();

  map.on("load", () => {
    restoreRasterLayers(restoredState.layers);
    updateShareUrl(false);
  });

  // 背景地図を切り替えるとMapLibreのstyleが入れ替わるため、
  // ユーザーが追加したレイヤーを再登録します。
  map.on("style.load", () => {
    reAddAllUserLayers();
  });

  map.on("error", handleMapError);
  map.on("moveend", () => updateShareUrl(false));
}

function buildStyle(basemapId) {
  const background = BACKGROUND_SOURCES[basemapId] || BACKGROUND_SOURCES["gsi-standard"];

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: background.tiles,
        tileSize: 256,
        maxzoom: background.maxzoom,
        attribution: background.attribution,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function bindUiEvents() {
  els.basemapSelect.addEventListener("change", () => {
    activeBasemapId = els.basemapSelect.value;
    setMessage(`背景地図を「${BACKGROUND_SOURCES[activeBasemapId].name}」へ切り替えました。`, "info");
    map.setStyle(buildStyle(activeBasemapId));
    updateShareUrl(false);
  });

  els.addXyzButton.addEventListener("click", () => {
    addRasterLayerFromForm();
  });

  els.shareButton.addEventListener("click", async () => {
    const url = updateShareUrl(true);
    await copyShareUrl(url);
  });

  els.chooseGeojsonButton.addEventListener("click", () => {
    els.geojsonFile.click();
  });

  els.geojsonFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      loadGeoJsonFile(file);
      event.target.value = "";
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragover");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) {
      loadGeoJsonFile(file);
    }
  });

  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.geojsonFile.click();
    }
  });
}

function addRasterLayerFromForm() {
  const url = normalizeXyzUrl(els.xyzUrl.value.trim());
  const name = els.xyzName.value.trim() || `XYZレイヤー ${rasterLayerSequence}`;

  const validation = validateXyzUrl(url);
  if (!validation.ok) {
    setMessage(validation.message, "error");
    return;
  }

  const layer = {
    id: `raster-${Date.now()}-${rasterLayerSequence}`,
    name,
    url,
    opacity: 0.85,
    visible: true,
    renderMode: shouldUseHtmlTileOverlay(url) ? "html" : "maplibre",
  };

  rasterLayerSequence += 1;
  rasterLayers.push(layer);
  addRasterLayerToMap(layer);
  renderLayerList();
  updateShareUrl(false);
  if (layer.renderMode === "html") {
    setMessage(
      "OpenAerialMap URLをOAM互換モードで追加しました。表示されない場合は、撮影地点付近まで拡大してください。",
      "success",
    );
  } else {
    setMessage("XYZタイルを追加しました。表示されない場合は、URLの形式、ズーム範囲、CORS設定を確認してください。", "success");
  }

  els.xyzName.value = "";
  els.xyzUrl.value = "";
}

function validateXyzUrl(url) {
  if (!url) {
    return {
      ok: false,
      message: "XYZタイルURLを入力してください。例: https://example.com/{z}/{x}/{y}.png",
    };
  }

  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      message: "URLは http:// または https:// で始まる必要があります。",
    };
  }

  const requiredTokens = ["{z}", "{x}", "{y}"];
  const missingTokens = requiredTokens.filter((token) => !url.includes(token));

  if (missingTokens.length > 0) {
    return {
      ok: false,
      message: `URL形式を確認してください。${missingTokens.join(" ")} が不足しています。例: https://example.com/{z}/{x}/{y}.png`,
    };
  }

  return { ok: true };
}

function normalizeXyzUrl(url) {
  /*
   * OpenAerialMapのタイルURLは、ブラウザやコピー元によって
   * {z}/{x}/{y} が %7Bz%7D/%7Bx%7D/%7By%7D のように
   * URLエンコードされた状態で渡されることがあります。
   * MapLibreはタイル座標の置換に {z} {x} {y} を使うため、
   * その3つのプレースホルダーだけを安全に戻します。
   */
  return url
    .replace(/%7Bz%7D/gi, "{z}")
    .replace(/%7Bx%7D/gi, "{x}")
    .replace(/%7By%7D/gi, "{y}");
}

function shouldUseHtmlTileOverlay(url) {
  /*
   * OAMの現行タイルURLはtitilerへリダイレクトされます。
   * 環境によってはCORSヘッダー不足でMapLibreのWebGL raster sourceが
   * "Failed to fetch" になります。通常の<img>タイルなら表示できるため、
   * OAMだけ互換モードで重ねます。
   */
  return /(^https?:\/\/)?tiles\.openaerialmap\.org\//i.test(url);
}

function addRasterLayerToMap(layer) {
  if (layer.renderMode === "html") {
    addHtmlTileLayer(layer);
    return;
  }

  if (!map.isStyleLoaded()) {
    map.once("style.load", () => addRasterLayerToMap(layer));
    return;
  }

  if (!map.getSource(layer.id)) {
    map.addSource(layer.id, {
      type: "raster",
      tiles: [layer.url],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 22,
      attribution: "User supplied XYZ tiles",
    });
  }

  if (!map.getLayer(layer.id)) {
    map.addLayer({
      id: layer.id,
      type: "raster",
      source: layer.id,
      paint: {
        "raster-opacity": layer.opacity,
      },
      layout: {
        visibility: layer.visible ? "visible" : "none",
      },
    });
  }
}

function handleMapError(event) {
  const message = event?.error?.message || "";

  if (!message) {
    return;
  }

  const lower = message.toLowerCase();
  const looksLikeTileProblem =
    lower.includes("failed") ||
    lower.includes("cors") ||
    lower.includes("404") ||
    lower.includes("403") ||
    lower.includes("network");

  if (looksLikeTileProblem) {
    setMessage(
      `タイルの取得に失敗した可能性があります。エラー: ${message}。URL形式、公開範囲、CORS設定、ズーム範囲を確認してください。`,
      "error",
    );
  }
}

function renderLayerList() {
  els.layerCount.textContent = String(rasterLayers.length + geojsonLayers.length);
  els.layerList.innerHTML = "";

  if (rasterLayers.length === 0 && geojsonLayers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "まだレイヤーはありません。";
    els.layerList.appendChild(empty);
    return;
  }

  rasterLayers.forEach((layer) => {
    els.layerList.appendChild(createRasterLayerItem(layer));
  });

  geojsonLayers.forEach((layer) => {
    els.layerList.appendChild(createGeoJsonLayerItem(layer));
  });
}

function createRasterLayerItem(layer) {
  const item = document.createElement("article");
  item.className = "layer-item";

  const topRow = document.createElement("div");
  topRow.className = "layer-top-row";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "toggle-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = layer.visible;
  checkbox.addEventListener("change", () => {
    layer.visible = checkbox.checked;
    setLayerVisibility(layer.id, layer.visible);
    updateShareUrl(false);
  });

  const name = document.createElement("span");
  name.className = "layer-name";
  name.textContent = layer.name;

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "icon-button";
  renameButton.title = "名前変更";
  renameButton.textContent = "編";
  renameButton.addEventListener("click", () => renameRasterLayer(layer));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "icon-button";
  deleteButton.title = "削除";
  deleteButton.textContent = "削";
  deleteButton.addEventListener("click", () => deleteRasterLayer(layer.id));

  checkboxLabel.append(checkbox, document.createTextNode("表示"));
  topRow.append(checkboxLabel, name, renameButton, deleteButton);

  const rangeLabel = document.createElement("label");
  rangeLabel.className = "range-label";
  rangeLabel.textContent = "透明度";

  const opacityRow = document.createElement("div");
  opacityRow.className = "opacity-control";

  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = String(Math.round(layer.opacity * 100));

  const opacityValue = document.createElement("span");
  opacityValue.className = "opacity-value";
  opacityValue.textContent = `${range.value}%`;

  range.addEventListener("input", () => {
    layer.opacity = Number(range.value) / 100;
    opacityValue.textContent = `${range.value}%`;
    const overlay = htmlTileOverlays.get(layer.id);

    if (overlay) {
      overlay.element.style.opacity = String(layer.opacity);
    } else if (map.getLayer(layer.id)) {
      map.setPaintProperty(layer.id, "raster-opacity", layer.opacity);
    }
    updateShareUrl(false);
  });

  opacityRow.append(range, opacityValue);
  item.append(topRow, rangeLabel, opacityRow);
  return item;
}

function createGeoJsonLayerItem(layer) {
  const item = document.createElement("article");
  item.className = "layer-item";

  const topRow = document.createElement("div");
  topRow.className = "layer-top-row";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "toggle-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = layer.visible;
  checkbox.addEventListener("change", () => {
    layer.visible = checkbox.checked;
    setGeoJsonVisibility(layer, layer.visible);
  });

  const name = document.createElement("span");
  name.className = "layer-name";
  name.textContent = layer.name;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "icon-button";
  deleteButton.title = "削除";
  deleteButton.textContent = "削";
  deleteButton.addEventListener("click", () => deleteGeoJsonLayer(layer.id));

  checkboxLabel.append(checkbox, document.createTextNode("表示"));
  topRow.append(checkboxLabel, name, deleteButton);
  item.append(topRow);
  return item;
}

function renameRasterLayer(layer) {
  const nextName = window.prompt("新しいレイヤー名を入力してください。", layer.name);

  if (!nextName || !nextName.trim()) {
    return;
  }

  layer.name = nextName.trim();
  renderLayerList();
  updateShareUrl(false);
}

function deleteRasterLayer(layerId) {
  const index = rasterLayers.findIndex((layer) => layer.id === layerId);

  if (index === -1) {
    return;
  }

  removeMapLayerAndSource(layerId);
  rasterLayers.splice(index, 1);
  renderLayerList();
  updateShareUrl(false);
}

function setLayerVisibility(layerId, visible) {
  const overlay = htmlTileOverlays.get(layerId);

  if (overlay) {
    overlay.element.style.display = visible ? "block" : "none";
    return;
  }

  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function removeMapLayerAndSource(id) {
  removeHtmlTileLayer(id);

  if (map.getLayer(id)) {
    map.removeLayer(id);
  }

  if (map.getSource(id)) {
    map.removeSource(id);
  }
}

function addHtmlTileLayer(layer) {
  if (htmlTileOverlays.has(layer.id)) {
    renderHtmlTileLayer(layer);
    return;
  }

  const element = document.createElement("div");
  element.className = "html-raster-layer";
  element.dataset.layerId = layer.id;
  element.style.opacity = String(layer.opacity);
  element.style.display = layer.visible ? "block" : "none";

  map.getContainer().appendChild(element);

  const render = () => requestHtmlTileRender(layer);
  const overlay = {
    element,
    render,
    frame: null,
  };

  htmlTileOverlays.set(layer.id, overlay);

  map.on("move", render);
  map.on("zoom", render);
  map.on("resize", render);

  renderHtmlTileLayer(layer);
}

function requestHtmlTileRender(layer) {
  const overlay = htmlTileOverlays.get(layer.id);

  if (!overlay || overlay.frame) {
    return;
  }

  overlay.frame = window.requestAnimationFrame(() => {
    overlay.frame = null;
    renderHtmlTileLayer(layer);
  });
}

function renderHtmlTileLayer(layer) {
  const overlay = htmlTileOverlays.get(layer.id);

  if (!overlay) {
    return;
  }

  const zoom = getHtmlTileZoom();
  const bounds = map.getBounds();
  const northWest = lngLatToTile(bounds.getWest(), bounds.getNorth(), zoom);
  const southEast = lngLatToTile(bounds.getEast(), bounds.getSouth(), zoom);
  const tileCount = 2 ** zoom;
  const minY = clampTileIndex(northWest.y, tileCount);
  const maxY = clampTileIndex(southEast.y, tileCount);
  const startX = Math.floor(northWest.x);
  const endX = Math.floor(southEast.x);
  const fragment = document.createDocumentFragment();

  overlay.element.innerHTML = "";

  for (let x = startX; x <= endX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const wrappedX = wrapTileX(x, tileCount);
      const tileBounds = getTileLngLatBounds(wrappedX, y, zoom);
      const topLeft = map.project([tileBounds.west, tileBounds.north]);
      const bottomRight = map.project([tileBounds.east, tileBounds.south]);
      const image = document.createElement("img");

      image.className = "html-raster-tile";
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      image.src = buildTileUrl(layer.url, zoom, wrappedX, y);
      image.style.left = `${topLeft.x}px`;
      image.style.top = `${topLeft.y}px`;
      image.style.width = `${Math.max(1, bottomRight.x - topLeft.x + 1)}px`;
      image.style.height = `${Math.max(1, bottomRight.y - topLeft.y + 1)}px`;
      image.onerror = () => {
        image.style.display = "none";
      };

      fragment.appendChild(image);
    }
  }

  overlay.element.style.opacity = String(layer.opacity);
  overlay.element.appendChild(fragment);
}

function getHtmlTileZoom() {
  return Math.max(0, Math.min(22, Math.round(map.getZoom())));
}

function buildTileUrl(template, z, x, y) {
  return template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));
}

function lngLatToTile(lng, lat, zoom) {
  const tileCount = 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;

  return {
    x: Math.floor(((lng + 180) / 360) * tileCount),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount),
  };
}

function getTileLngLatBounds(x, y, zoom) {
  const tileCount = 2 ** zoom;
  const west = (x / tileCount) * 360 - 180;
  const east = ((x + 1) / tileCount) * 360 - 180;
  const north = tileYToLat(y, tileCount);
  const south = tileYToLat(y + 1, tileCount);

  return { west, south, east, north };
}

function tileYToLat(y, tileCount) {
  const value = Math.PI * (1 - (2 * y) / tileCount);
  return (Math.atan(Math.sinh(value)) * 180) / Math.PI;
}

function wrapTileX(x, tileCount) {
  return ((x % tileCount) + tileCount) % tileCount;
}

function clampTileIndex(value, tileCount) {
  return Math.max(0, Math.min(tileCount - 1, Math.floor(value)));
}

function removeHtmlTileLayer(layerId) {
  const overlay = htmlTileOverlays.get(layerId);

  if (!overlay) {
    return;
  }

  if (overlay.frame) {
    window.cancelAnimationFrame(overlay.frame);
  }

  map.off("move", overlay.render);
  map.off("zoom", overlay.render);
  map.off("resize", overlay.render);
  overlay.element.remove();
  htmlTileOverlays.delete(layerId);
}

async function loadGeoJsonFile(file) {
  try {
    const text = await file.text();
    const geojson = JSON.parse(text);

    if (!isGeoJsonLike(geojson)) {
      throw new Error("FeatureCollection、Feature、またはGeometryのGeoJSONを指定してください。");
    }

    const layer = {
      id: `geojson-${Date.now()}-${geojsonLayerSequence}`,
      name: file.name || `GeoJSON ${geojsonLayerSequence}`,
      data: geojson,
      visible: true,
    };

    geojsonLayerSequence += 1;
    geojsonLayers.push(layer);
    addGeoJsonLayerToMap(layer, true);
    renderLayerList();
    setMessage("GeoJSONを追加しました。地物をクリックするとpropertiesを確認できます。", "success");
  } catch (error) {
    setMessage(`GeoJSONの読み込みに失敗しました。${error.message}`, "error");
  }
}

function isGeoJsonLike(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      ["FeatureCollection", "Feature", "Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"].includes(data.type),
  );
}

function addGeoJsonLayerToMap(layer, shouldFitBounds = false) {
  if (!map.isStyleLoaded()) {
    map.once("style.load", () => addGeoJsonLayerToMap(layer, shouldFitBounds));
    return;
  }

  if (!map.getSource(layer.id)) {
    map.addSource(layer.id, {
      type: "geojson",
      data: layer.data,
    });
  }

  const fillId = `${layer.id}-fill`;
  const lineId = `${layer.id}-line`;
  const pointId = `${layer.id}-point`;

  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: layer.id,
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": 0.28,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });
  }

  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: "line",
      source: layer.id,
      paint: {
        "line-color": "#d97706",
        "line-width": 2,
      },
    });
  }

  if (!map.getLayer(pointId)) {
    map.addLayer({
      id: pointId,
      type: "circle",
      source: layer.id,
      paint: {
        "circle-color": "#dc2626",
        "circle-radius": 6,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
      filter: ["==", ["geometry-type"], "Point"],
    });
  }

  [fillId, lineId, pointId].forEach((id) => {
    map.on("click", id, (event) => showPropertiesPopup(event));
    map.on("mouseenter", id, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", id, () => {
      map.getCanvas().style.cursor = "";
    });
  });

  if (shouldFitBounds) {
    fitToGeoJson(layer.data);
  }
}

function showPropertiesPopup(event) {
  const feature = event.features?.[0];

  if (!feature) {
    return;
  }

  const html = buildPropertiesTable(feature.properties || {});
  popup.setLngLat(event.lngLat).setHTML(html).addTo(map);
}

function buildPropertiesTable(properties) {
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return "<p>propertiesはありません。</p>";
  }

  const rows = entries
    .map(([key, value]) => {
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value))}</td></tr>`;
    })
    .join("");

  return `<table class="popup-table"><tbody>${rows}</tbody></table>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setGeoJsonVisibility(layer, visible) {
  [`${layer.id}-fill`, `${layer.id}-line`, `${layer.id}-point`].forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
}

function deleteGeoJsonLayer(layerId) {
  const index = geojsonLayers.findIndex((layer) => layer.id === layerId);

  if (index === -1) {
    return;
  }

  [`${layerId}-fill`, `${layerId}-line`, `${layerId}-point`].forEach((id) => {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  });

  if (map.getSource(layerId)) {
    map.removeSource(layerId);
  }

  geojsonLayers.splice(index, 1);
  renderLayerList();
}

function fitToGeoJson(geojson) {
  const bounds = calculateGeoJsonBounds(geojson);

  if (!bounds) {
    return;
  }

  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 17,
    duration: 800,
  });
}

function calculateGeoJsonBounds(geojson) {
  const coordinates = [];

  collectCoordinates(geojson, coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  return coordinates.reduce((bounds, coord) => bounds.extend(coord), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
}

function collectCoordinates(node, coordinates) {
  if (!node) {
    return;
  }

  if (node.type === "FeatureCollection") {
    node.features.forEach((feature) => collectCoordinates(feature, coordinates));
    return;
  }

  if (node.type === "Feature") {
    collectCoordinates(node.geometry, coordinates);
    return;
  }

  collectCoordinateArray(node.coordinates, coordinates);
}

function collectCoordinateArray(value, coordinates) {
  if (!Array.isArray(value)) {
    return;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    coordinates.push([value[0], value[1]]);
    return;
  }

  value.forEach((child) => collectCoordinateArray(child, coordinates));
}

function reAddAllUserLayers() {
  rasterLayers.forEach((layer) => addRasterLayerToMap(layer));
  geojsonLayers.forEach((layer) => addGeoJsonLayerToMap(layer));
}

function updateShareUrl(shouldWriteBrowserUrl) {
  const center = map.getCenter();
  const state = {
    lat: roundForUrl(center.lat),
    lng: roundForUrl(center.lng),
    zoom: roundForUrl(map.getZoom()),
    basemap: activeBasemapId,
    layers: rasterLayers.map((layer) => ({
      name: layer.name,
      url: layer.url,
      opacity: layer.opacity,
      visible: layer.visible,
    })),
  };

  const params = new URLSearchParams();
  params.set("lat", state.lat);
  params.set("lng", state.lng);
  params.set("z", state.zoom);
  params.set("basemap", state.basemap);

  if (state.layers.length > 0) {
    params.set("layers", encodeLayerState(state.layers));
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  els.shareUrl.value = shareUrl;

  if (shouldWriteBrowserUrl) {
    window.history.replaceState(null, "", shareUrl);
  }

  return shareUrl;
}

function roundForUrl(value) {
  return Number(value).toFixed(6).replace(/\.?0+$/, "");
}

function encodeLayerState(layers) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(layers))));
}

function decodeLayerState(value) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch (error) {
    setMessage("共有URL内のレイヤー情報を読み取れませんでした。", "error");
    return [];
  }
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const zoom = Number(params.get("z"));
  const basemap = params.get("basemap");
  const layersParam = params.get("layers");

  return {
    center: Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null,
    zoom: Number.isFinite(zoom) ? zoom : null,
    basemap: BACKGROUND_SOURCES[basemap] ? basemap : null,
    layers: layersParam ? decodeLayerState(layersParam) : [],
  };
}

function restoreRasterLayers(layers = []) {
  layers.forEach((savedLayer) => {
    const url = normalizeXyzUrl(savedLayer.url || "");

    if (!url || !validateXyzUrl(url).ok) {
      return;
    }

    const layer = {
      id: `raster-${Date.now()}-${rasterLayerSequence}`,
      name: savedLayer.name || `XYZレイヤー ${rasterLayerSequence}`,
      url,
      opacity: typeof savedLayer.opacity === "number" ? savedLayer.opacity : 0.85,
      visible: savedLayer.visible !== false,
      renderMode: shouldUseHtmlTileOverlay(url) ? "html" : "maplibre",
    };

    rasterLayerSequence += 1;
    rasterLayers.push(layer);
    addRasterLayerToMap(layer);
  });

  renderLayerList();
}

async function copyShareUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    setMessage("共有URLをコピーしました。", "success");
  } catch (error) {
    setMessage("共有URLを作成しました。入力欄からコピーしてください。", "info");
  }
}

function setMessage(text, type) {
  els.message.textContent = text;
  els.message.className = `message is-${type}`;
}
