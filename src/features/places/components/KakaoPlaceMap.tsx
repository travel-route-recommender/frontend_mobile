import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { Place } from "../../../domain";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { parsePlaceCoordinate } from "../logic/placeSearch";

const DEFAULT_MAP_HEIGHT = 286;
const MAX_MAP_MARKERS = 10;

type MapMarkerPlace = {
  id: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  isReference?: boolean;
};

type MapMessage =
  | { type: "ready" }
  | { type: "select-place"; placeId?: string }
  | { type: "error"; message?: string };

type KakaoPlaceMapProps = {
  places: readonly Place[];
  apiKey?: string;
  baseUrl?: string;
  highlightedPlace?: Place;
  fill?: boolean;
  framed?: boolean;
  focusBottomInset?: number;
  focusTopInset?: number;
  focusYRatio?: number;
  height?: number;
  selectedPlaceId?: string;
  showBuiltInZoomControl?: boolean;
  zoomControlBottomOffset?: number;
  zoomControlPosition?: "TOPRIGHT" | "RIGHT" | "BOTTOMRIGHT";
  onSelectPlace?(placeId: string): void;
};

function clampMapFocusInset(value: number | undefined, maxValue: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(value, maxValue));
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildMarkerFromPlace(place: Place, isReference = false): MapMarkerPlace[] {
    const coordinate = parsePlaceCoordinate(place);
    if (!coordinate) return [];
    return [{
      id: place.id,
      name: place.name,
      address: place.address,
      category: place.category,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      ...(isReference ? { isReference: true } : {}),
    }];
}

function buildMapMarkers(places: readonly Place[], highlightedPlace?: Place) {
  const markersById = new Map<string, MapMarkerPlace>();
  places.flatMap((place) => buildMarkerFromPlace(place)).slice(0, MAX_MAP_MARKERS).forEach((marker) => {
    markersById.set(marker.id, marker);
  });
  if (highlightedPlace) {
    buildMarkerFromPlace(highlightedPlace, true).forEach((marker) => {
      markersById.set(marker.id, marker);
    });
  }
  return Array.from(markersById.values()).sort((a, b) => Number(a.isReference) - Number(b.isReference));
}

function buildFallbackCenter(markers: readonly MapMarkerPlace[]) {
  if (!markers.length) return { latitude: 37.5665, longitude: 126.9780 };
  const referenceMarker = markers.find((marker) => marker.isReference);
  if (referenceMarker) {
    return { latitude: referenceMarker.latitude, longitude: referenceMarker.longitude };
  }
  const bounds = markers.reduce((acc, marker) => ({
    minLat: Math.min(acc.minLat, marker.latitude),
    maxLat: Math.max(acc.maxLat, marker.latitude),
    minLng: Math.min(acc.minLng, marker.longitude),
    maxLng: Math.max(acc.maxLng, marker.longitude),
  }), {
    minLat: markers[0].latitude,
    maxLat: markers[0].latitude,
    minLng: markers[0].longitude,
    maxLng: markers[0].longitude,
  });
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
  };
}

function buildKakaoMapHtml(markers: readonly MapMarkerPlace[], apiKey: string, initialFocusTopInset: number, initialFocusBottomInset: number, initialFocusYRatio: number, initialSelectedPlaceId = "", showBuiltInZoomControl = true, zoomControlPosition = "TOPRIGHT", initialZoomControlBottomOffset?: number) {
  const appKey = encodeURIComponent(apiKey);
  const placesJson = serializeForScript(markers);
  const centerJson = serializeForScript(buildFallbackCenter(markers));
  const focusTopInsetJson = serializeForScript(initialFocusTopInset);
  const focusBottomInsetJson = serializeForScript(initialFocusBottomInset);
  const focusYRatioJson = serializeForScript(initialFocusYRatio);
  const selectedPlaceIdJson = serializeForScript(initialSelectedPlaceId);
  const showBuiltInZoomControlJson = serializeForScript(showBuiltInZoomControl);
  const zoomControlPositionJson = serializeForScript(zoomControlPosition);
  const zoomControlBottomOffsetJson = serializeForScript(initialZoomControlBottomOffset ?? null);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { overflow: hidden; background: #eff5ff; color: #243c8f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #state { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; padding: 24px; text-align: center; background: #eff5ff; box-sizing: border-box; z-index: 5; }
    #state strong { display: block; font-size: 15px; line-height: 22px; margin-bottom: 4px; }
    #state span { display: block; font-size: 12px; line-height: 18px; color: #6479a8; }
    .info-window { min-width: 150px; max-width: 220px; padding: 10px 12px; border-radius: 12px; color: #243c8f; box-sizing: border-box; }
    .info-window strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; }
    .info-window span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-size: 12px; line-height: 17px; color: #6479a8; }
    #duri-zoom-control { position: absolute; right: 12px; bottom: 52px; z-index: 12; display: none; width: 42px; overflow: hidden; border: 1px solid rgba(36, 60, 143, 0.16); border-radius: 8px; background: #fff; box-shadow: 0 2px 6px rgba(36, 60, 143, 0.2); }
    .duri-zoom-button { width: 42px; height: 38px; margin: 0; padding: 0; border: 0; background: #fff; color: #222; font-size: 26px; line-height: 36px; font-weight: 700; text-align: center; appearance: none; }
    .duri-zoom-button:active { background: #eef5ff; }
    .duri-zoom-slider { position: relative; height: 92px; border-top: 1px solid #e0e6f2; border-bottom: 1px solid #e0e6f2; background: #fff; }
    .duri-zoom-track { position: absolute; top: 12px; bottom: 12px; left: 19px; width: 4px; border-radius: 999px; background: #d6e3f7; }
    .duri-zoom-thumb { position: absolute; left: 13px; width: 16px; height: 8px; border-radius: 999px; background: #2f8cff; box-shadow: 0 1px 2px rgba(47, 140, 255, 0.32); }
  </style>
</head>
<body>
  <div id="map" role="application" aria-label="카카오 장소 지도"></div>
  <div id="duri-zoom-control" aria-label="지도 확대 축소">
    <button id="duri-zoom-in" class="duri-zoom-button" type="button" aria-label="지도 확대">+</button>
    <div class="duri-zoom-slider" aria-hidden="true"><div class="duri-zoom-track"></div><div id="duri-zoom-thumb" class="duri-zoom-thumb"></div></div>
    <button id="duri-zoom-out" class="duri-zoom-button" type="button" aria-label="지도 축소">−</button>
  </div>
  <div id="state"><div><strong id="state-title"></strong><span id="state-description"></span></div></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false"></script>
  <script>
    var places = ${placesJson};
    var fallbackCenter = ${centerJson};
    var focusTopInset = ${focusTopInsetJson};
    var focusBottomInset = ${focusBottomInsetJson};
    var focusYRatio = ${focusYRatioJson};
    var selectedPlaceId = ${selectedPlaceIdJson};
    var showBuiltInZoomControl = ${showBuiltInZoomControlJson};
    var zoomControlPosition = ${zoomControlPositionJson};
    var zoomControlBottomOffset = ${zoomControlBottomOffsetJson};
    var readyPosted = false;
    var mapInstance = null;
    var mapBounds = null;
    var primaryPosition = null;
    var positionsById = {};
    var referenceMarkerImage = null;

    function post(message) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      } catch (_) {}
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, function (char) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
      });
    }

    function showState(title, description) {
      document.getElementById("state-title").textContent = title;
      document.getElementById("state-description").textContent = description;
      document.getElementById("state").style.display = "flex";
      post({ type: "error", message: title });
    }

    function infoContent(place) {
      return "<div class='info-window'><strong>" + escapeHtml(place.name) + "</strong><span>" + escapeHtml(place.category) + " · " + escapeHtml(place.address) + "</span></div>";
    }

    function getViewportHeight() {
      return Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, 320);
    }

    function getViewportWidth() {
      return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0, 320);
    }

    function getReferenceMarkerImage() {
      if (referenceMarkerImage) return referenceMarkerImage;
      var markerSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="54" viewBox="0 0 42 54"><path fill="#F04438" stroke="#FFFFFF" stroke-width="3" d="M21 2C10.5 2 2 10.3 2 20.5c0 13.9 16.2 28.9 18.2 30.7.5.5 1.3.5 1.8 0C24 49.4 40 34.4 40 20.5 40 10.3 31.5 2 21 2Z"/><circle cx="21" cy="20.5" r="7.5" fill="#FFFFFF"/></svg>';
      referenceMarkerImage = new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg),
        new kakao.maps.Size(42, 54),
        { offset: new kakao.maps.Point(21, 52) }
      );
      return referenceMarkerImage;
    }

    function getViewportPadding() {
      var height = getViewportHeight();
      var top = Math.min(Math.max(Math.round(focusTopInset), 12), Math.max(12, height - 60));
      var bottom = Math.min(Math.max(Math.round(focusBottomInset), 12), Math.max(12, height - top - 48));
      return {
        top: top,
        right: 40,
        bottom: bottom,
        left: 40
      };
    }

    function getFocusTargetPoint() {
      var width = getViewportWidth();
      var height = getViewportHeight();
      var padding = getViewportPadding();
      var targetRatio = Number(focusYRatio);
      if (!Number.isFinite(targetRatio)) targetRatio = 0.42;
      targetRatio = Math.max(0.2, Math.min(targetRatio, 0.8));
      var visibleTop = padding.top;
      var visibleBottom = Math.max(visibleTop + 48, height - padding.bottom);
      var targetY = visibleTop + (visibleBottom - visibleTop) * targetRatio;
      return new kakao.maps.Point(Math.round(width * 0.5), Math.round(targetY));
    }

    function movePositionToFocusTarget(position) {
      if (!mapInstance || !position) return;
      var height = getViewportHeight();
      var targetPoint = getFocusTargetPoint();
      var deltaY = Math.round((height * 0.5) - targetPoint.y);
      mapInstance.setCenter(position);
      if (deltaY !== 0 && mapInstance.panBy) {
        // Positive y moves the selected/fallback position upward within the visible map.
        mapInstance.panBy(0, deltaY);
      }
    }

    function getFallbackPosition() {
      return new kakao.maps.LatLng(fallbackCenter.latitude, fallbackCenter.longitude);
    }

    function syncCustomZoomControl() {
      var root = document.getElementById("duri-zoom-control");
      if (!root) return;
      if (!Number.isFinite(Number(zoomControlBottomOffset))) {
        root.style.display = "none";
        return;
      }
      root.style.display = "block";
      root.style.bottom = Math.max(12, Math.round(Number(zoomControlBottomOffset))) + "px";
      if (focusTopInset + root.offsetHeight + Number(zoomControlBottomOffset) + 24 > getViewportHeight()) {
        root.style.display = "none";
        return;
      }
      updateZoomThumb();
    }

    function updateZoomThumb() {
      if (!mapInstance) return;
      var thumb = document.getElementById("duri-zoom-thumb");
      if (!thumb) return;
      var minLevel = 1;
      var maxLevel = 14;
      var trackTop = 12;
      var trackTravel = 64;
      var level = Math.max(minLevel, Math.min(maxLevel, mapInstance.getLevel()));
      var progress = (level - minLevel) / (maxLevel - minLevel);
      thumb.style.top = Math.round(trackTop + progress * trackTravel) + "px";
    }

    function changeZoom(delta) {
      if (!mapInstance) return;
      var nextLevel = Math.max(1, Math.min(14, mapInstance.getLevel() + delta));
      mapInstance.setLevel(nextLevel);
      setTimeout(function () {
        var focusPosition = selectedPlaceId && positionsById[selectedPlaceId] ? positionsById[selectedPlaceId] : getFallbackPosition();
        movePositionToFocusTarget(focusPosition);
        updateZoomThumb();
      }, 0);
    }

    function applyMapViewport() {
      if (!mapInstance || !places.length) return;
      mapInstance.relayout();
      syncCustomZoomControl();
      var selectedPosition = selectedPlaceId ? positionsById[selectedPlaceId] : null;
      if (selectedPosition) {
        movePositionToFocusTarget(selectedPosition);
        return;
      }
      if (mapBounds) {
        var padding = getViewportPadding();
        mapInstance.setBounds(mapBounds, padding.top, padding.right, padding.bottom, padding.left);
        setTimeout(function () {
          movePositionToFocusTarget(getFallbackPosition());
        }, 0);
      }
    }

    window.__DURI_SET_MAP_FOCUS__ = function (nextTopInset, nextBottomInset, nextSelectedPlaceId, nextFocusYRatio, nextZoomControlBottomOffset) {
      var parsedTopInset = Number(nextTopInset);
      var parsedBottomInset = Number(nextBottomInset);
      var parsedFocusYRatio = Number(nextFocusYRatio);
      var parsedZoomControlBottomOffset = Number(nextZoomControlBottomOffset);
      if (Number.isFinite(parsedTopInset)) focusTopInset = parsedTopInset;
      if (Number.isFinite(parsedBottomInset)) focusBottomInset = parsedBottomInset;
      if (typeof nextSelectedPlaceId === "string") selectedPlaceId = nextSelectedPlaceId;
      if (Number.isFinite(parsedFocusYRatio)) focusYRatio = parsedFocusYRatio;
      zoomControlBottomOffset = Number.isFinite(parsedZoomControlBottomOffset) ? parsedZoomControlBottomOffset : null;
      setTimeout(applyMapViewport, 0);
    };

    function initMap() {
      if (!window.kakao || !window.kakao.maps) {
        showState("지도를 불러오지 못했어요", "카카오 지도 스크립트 연결을 확인해 주세요.");
        return;
      }
      if (!places.length) {
        showState("표시할 위치가 없어요", "좌표가 있는 여행지를 불러오면 지도가 표시돼요.");
        return;
      }

      var map = new kakao.maps.Map(document.getElementById("map"), {
        center: new kakao.maps.LatLng(fallbackCenter.latitude, fallbackCenter.longitude),
        level: places.length > 1 ? 8 : 4,
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false
      });
      mapInstance = map;
      map.setDraggable(true);
      map.setZoomable(true);
      if (showBuiltInZoomControl) {
        var controlPosition = kakao.maps.ControlPosition[zoomControlPosition] || kakao.maps.ControlPosition.TOPRIGHT;
        map.addControl(new kakao.maps.ZoomControl(), controlPosition);
      }
      document.getElementById("duri-zoom-in").onclick = function () { changeZoom(-1); };
      document.getElementById("duri-zoom-out").onclick = function () { changeZoom(1); };
      kakao.maps.event.addListener(map, "zoom_changed", updateZoomThumb);
      var bounds = new kakao.maps.LatLngBounds();
      mapBounds = bounds;
      var infowindow = new kakao.maps.InfoWindow({ zIndex: 10 });

      places.forEach(function (place) {
        var position = new kakao.maps.LatLng(place.latitude, place.longitude);
        if (!primaryPosition) primaryPosition = position;
        positionsById[place.id] = position;
        var markerOptions = {
          map: map,
          position: position,
          title: place.name,
          clickable: true
        };
        if (place.isReference) {
          markerOptions.image = getReferenceMarkerImage();
          markerOptions.zIndex = 40;
        }
        var marker = new kakao.maps.Marker(markerOptions);
        bounds.extend(position);
        if (places.length === 1) {
          bounds.extend(new kakao.maps.LatLng(place.latitude + 0.002, place.longitude + 0.002));
          bounds.extend(new kakao.maps.LatLng(place.latitude - 0.002, place.longitude - 0.002));
        }
        kakao.maps.event.addListener(marker, "click", function () {
          selectedPlaceId = place.id;
          infowindow.setContent(infoContent(place));
          infowindow.open(map, marker);
          applyMapViewport();
          post({ type: "select-place", placeId: place.id });
        });
      });

      setTimeout(function () {
        applyMapViewport();
        if (!readyPosted) {
          readyPosted = true;
          post({ type: "ready" });
        }
      }, 80);
    }

    window.onerror = function (message) {
      showState("지도를 불러오지 못했어요", String(message || "알 수 없는 오류가 발생했어요."));
    };

    if (window.kakao && window.kakao.maps) {
      kakao.maps.load(initMap);
    } else {
      showState("지도를 불러오지 못했어요", "카카오 지도 스크립트 연결을 확인해 주세요.");
    }
  </script>
</body>
</html>`;
}

function MapState({ title, description, fill, height }: { title: string; description: string; fill: boolean; height: number }) {
  return <View accessibilityRole="summary" style={[styles.state, fill ? styles.fill : { height }]}>
    <Text style={styles.stateTitle}>{title}</Text>
    <Text style={styles.stateDescription}>{description}</Text>
  </View>;
}

export function KakaoPlaceMap({
  places,
  apiKey,
  baseUrl,
  highlightedPlace,
  fill = false,
  framed = true,
  focusBottomInset,
  focusTopInset,
  focusYRatio = 0.38,
  height = DEFAULT_MAP_HEIGHT,
  selectedPlaceId,
  showBuiltInZoomControl = true,
  zoomControlBottomOffset,
  zoomControlPosition = "TOPRIGHT",
  onSelectPlace,
}: KakaoPlaceMapProps) {
  const [loadError, setLoadError] = useState("");
  const [layoutHeight, setLayoutHeight] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const markers = useMemo(() => buildMapMarkers(places, highlightedPlace), [highlightedPlace, places]);
  const measuredHeight = layoutHeight || height;
  const safeFocusTopInset = clampMapFocusInset(focusTopInset, measuredHeight * 0.82);
  const safeFocusBottomInset = clampMapFocusInset(focusBottomInset, measuredHeight * 0.9);
  const safeFocusYRatio = Math.max(0.2, Math.min(focusYRatio, 0.8));
  const [initialFocusTopInset] = useState(safeFocusTopInset);
  const [initialFocusBottomInset] = useState(safeFocusBottomInset);
  const [initialFocusYRatio] = useState(safeFocusYRatio);
  const [initialSelectedPlaceId] = useState(selectedPlaceId ?? "");
  const [initialZoomControlBottomOffset] = useState(zoomControlBottomOffset);
  const html = useMemo(
    () => apiKey?.trim() ? buildKakaoMapHtml(markers, apiKey.trim(), initialFocusTopInset, initialFocusBottomInset, initialFocusYRatio, initialSelectedPlaceId, showBuiltInZoomControl, zoomControlPosition, initialZoomControlBottomOffset) : "",
    [apiKey, initialFocusBottomInset, initialFocusTopInset, initialFocusYRatio, initialSelectedPlaceId, initialZoomControlBottomOffset, markers, showBuiltInZoomControl, zoomControlPosition],
  );
  const sourceBaseUrl = baseUrl?.trim() || "http://localhost:3000";
  const webViewSource = useMemo(
    () => ({ html, baseUrl: sourceBaseUrl }),
    [html, sourceBaseUrl],
  );
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0) setLayoutHeight((current) => current === nextHeight ? current : nextHeight);
  }, []);
  const injectMapFocus = useCallback(() => {
    webViewRef.current?.injectJavaScript(`window.__DURI_SET_MAP_FOCUS__ && window.__DURI_SET_MAP_FOCUS__(${serializeForScript(safeFocusTopInset)}, ${serializeForScript(safeFocusBottomInset)}, ${serializeForScript(selectedPlaceId ?? "")}, ${serializeForScript(safeFocusYRatio)}, ${serializeForScript(zoomControlBottomOffset ?? null)}); true;`);
  }, [safeFocusBottomInset, safeFocusTopInset, safeFocusYRatio, selectedPlaceId, zoomControlBottomOffset]);

  useEffect(() => {
    injectMapFocus();
  }, [injectMapFocus]);

  if (!apiKey?.trim()) {
    return <MapState fill={fill} height={height} title="카카오 지도 키가 필요해요" description="EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY를 설정해 주세요." />;
  }
  if (!markers.length) {
    return <MapState fill={fill} height={height} title="지도에 표시할 장소가 없어요" description="좌표가 있는 백엔드 장소를 불러오면 이곳에 표시돼요." />;
  }

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: MapMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as MapMessage;
    } catch {
      return;
    }
    if (message.type === "select-place" && message.placeId) {
      onSelectPlace?.(message.placeId);
      return;
    }
    if (message.type === "ready") {
      injectMapFocus();
      return;
    }
    if (message.type === "error" && message.message) {
      setLoadError(message.message);
    }
  };

  return <View onLayout={handleLayout} style={[framed ? styles.root : styles.embeddedRoot, fill ? styles.fill : { height }]}>
    <WebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={webViewSource}
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled
      allowFileAccess={false}
      scrollEnabled={false}
      nestedScrollEnabled={false}
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      mixedContentMode="never"
      onMessage={handleMessage}
      onLoadStart={() => setLoadError("")}
      onLoadEnd={injectMapFocus}
      onError={(event) => setLoadError(event.nativeEvent.description || "지도를 불러오지 못했어요.")}
      style={styles.webview}
    />
    {loadError ? <View pointerEvents="none" style={styles.errorBadge}><Text numberOfLines={1} style={styles.errorText}>{loadError}</Text></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, ...shadows.card },
  embeddedRoot: { overflow: "hidden", backgroundColor: colors.background },
  fill: { flex: 1, width: "100%" },
  webview: { flex: 1, backgroundColor: colors.background },
  state: { alignItems: "center", justifyContent: "center", gap: spacing.xxs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  stateTitle: { ...typography.bodyStrong, color: colors.text, textAlign: "center" },
  stateDescription: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  errorBadge: { position: "absolute", left: spacing.sm, right: spacing.sm, bottom: spacing.sm, minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.overlay },
  errorText: { ...typography.caption, color: colors.white, textAlign: "center" },
});
