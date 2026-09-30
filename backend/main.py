from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import requests
from urllib.parse import urljoin
import xarray as xr
import numpy as np
import urllib.request
import os
import re
import copernicusmarine
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


load_dotenv()

GFW_API_KEY = os.getenv("GFW_API_KEY")
GFW_API_BASE = "https://gateway.api.globalfishingwatch.org"

_gfw_style_url = None

_gfw_style_range = None


def create_gfw_session(trust_env=False):
    """
    Create a resilient HTTPS session for Global Fishing Watch.

    trust_env=False avoids inherited proxy environment variables, which can
    cause TLS EOF errors on some Windows/Python setups. SSL verification
    remains enabled.
    """
    session = requests.Session()
    session.trust_env = trust_env

    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET", "POST"]),
        raise_on_status=False,
    )

    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=10,
        pool_maxsize=20,
    )

    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "SAMUDRA-Ocean-Intelligence/1.0",
        "Accept": "*/*",
    })

    return session


_gfw_direct_session = create_gfw_session(trust_env=False)
_gfw_env_session = create_gfw_session(trust_env=True)


app = FastAPI(title="SAMUDRA Ocean API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GLOBAL COPERNICUS MARINE DATA
# ============================================================

COPERNICUS_AREA_SIZE = 0.25
COPERNICUS_DAYS_BACK = 2

# Small in-memory cache so repeated clicks on the same/nearby grid cell
# do not immediately trigger another remote Copernicus request.
_COPERNICUS_CACHE = {}
_COPERNICUS_CACHE_TTL_SECONDS = 300

def _cache_key(latitude, longitude, dataset_id, variable):
    return (round(float(latitude), 2), round(float(longitude), 2), dataset_id, variable)


def get_latest_valid_copernicus_value(
    latitude,
    longitude,
    dataset_id,
    variable,
    unit,
    use_depth=True,
):
    """
    Get the latest valid Copernicus value near a clicked location.

    The request is made against the global Copernicus Marine dataset,
    not the old local test-data NetCDF files.

    The function searches the newest available time first and then
    selects the nearest valid ocean grid cell to the clicked location.
    """

    import time

    cache_key = _cache_key(latitude, longitude, dataset_id, variable)
    cached = _COPERNICUS_CACHE.get(cache_key)
    if cached is not None:
        cached_time, cached_value = cached
        if time.time() - cached_time < _COPERNICUS_CACHE_TTL_SECONDS:
            return cached_value.copy() if cached_value else None
        _COPERNICUS_CACHE.pop(cache_key, None)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_time = now - timedelta(days=COPERNICUS_DAYS_BACK)

    area = COPERNICUS_AREA_SIZE

    kwargs = {
        "dataset_id": dataset_id,
        "variables": [variable],
        "minimum_longitude": longitude - area,
        "maximum_longitude": longitude + area,
        "minimum_latitude": latitude - area,
        "maximum_latitude": latitude + area,
        "start_datetime": start_time.isoformat(),
        "end_datetime": now.isoformat(),
        "coordinates_selection_method": "nearest",
    }

    if use_depth:
        # The surface coordinate in these Copernicus products is
        # approximately 0.494 m. Selecting 0-1 m with nearest-cell
        # selection safely targets that surface level.
        kwargs["minimum_depth"] = 0
        kwargs["maximum_depth"] = 1

    dataset = None

    try:
        dataset = copernicusmarine.open_dataset(**kwargs)

        if "time" not in dataset.coords:
            return None

        data = dataset[variable].compute()

        best_result = None

        # Newest time first. We requested only times up to the current
        # UTC time, so a future forecast timestamp is not selected.
        for time_index in range(len(dataset.time) - 1, -1, -1):

            time_value = dataset.time.values[time_index]
            current_data = data.isel(time=time_index).values

            # Remove dimensions such as depth while keeping latitude
            # and longitude. Surface products normally become a
            # latitude x longitude array here.
            while current_data.ndim > 2:
                current_data = current_data[0]

            if current_data.ndim != 2:
                continue

            for lat_index in range(len(dataset.latitude)):
                for lon_index in range(len(dataset.longitude)):

                    value = current_data[lat_index, lon_index]

                    if not np.isfinite(value):
                        continue

                    data_lat = float(
                        dataset.latitude.values[lat_index]
                    )
                    data_lon = float(
                        dataset.longitude.values[lon_index]
                    )

                    distance = (
                        (data_lat - latitude) ** 2
                        + (data_lon - longitude) ** 2
                    )

                    candidate = {
                        "latitude": data_lat,
                        "longitude": data_lon,
                        "value": float(value),
                        "unit": unit,
                        "timestamp": str(time_value),
                        "distance": float(distance),
                        "source": "Copernicus Marine",
                        "dataset": dataset_id,
                    }

                    if (
                        best_result is None
                        or distance < best_result["distance"]
                    ):
                        best_result = candidate

            # Once a valid value is found at the newest available time,
            # do not fall back to an older day.
            if best_result is not None:
                break

        if best_result is None:
            return None

        best_result.pop("distance", None)
        _COPERNICUS_CACHE[cache_key] = (time.time(), best_result)
        return best_result.copy()

    except Exception as error:
        print(
            f"Copernicus error for {variable}: {error}"
        )
        return None

    finally:
        if dataset is not None:
            try:
                dataset.close()
            except Exception:
                pass


# ============================================================
# TEMPERATURE
# ============================================================

def get_nearest_temperature(latitude, longitude):

    result = get_latest_valid_copernicus_value(
        latitude,
        longitude,
        dataset_id=(
            "cmems_mod_glo_phy-"
            "thetao_anfc_0.083deg_P1D-m"
        ),
        variable="thetao",
        unit="°C",
        use_depth=True,
    )

    if result is None:
        return None

    return {
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "temperature": result["value"],
        "unit": result["unit"],
        "depth": 0.494025,
        "timestamp": result["timestamp"],
        "source": result["source"],
        "dataset": result["dataset"],
    }


# ============================================================
# SALINITY
# ============================================================

def get_nearest_salinity(latitude, longitude):

    result = get_latest_valid_copernicus_value(
        latitude,
        longitude,
        dataset_id=(
            "cmems_mod_glo_phy-"
            "so_anfc_0.083deg_P1D-m"
        ),
        variable="so",
        unit="PSU",
        use_depth=True,
    )

    if result is None:
        return None

    return {
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "salinity": result["value"],
        "unit": result["unit"],
        "depth": 0.494025,
        "timestamp": result["timestamp"],
        "source": result["source"],
        "dataset": result["dataset"],
    }


# ============================================================
# CHLOROPHYLL
# ============================================================

def get_nearest_chlorophyll(latitude, longitude):

    result = get_latest_valid_copernicus_value(
        latitude,
        longitude,
        dataset_id=(
            "cmems_mod_glo_bgc-pft_"
            "anfc_0.25deg_P1D-m"
        ),
        variable="chl",
        unit="mg/m³",
        use_depth=True,
    )

    if result is None:
        return None

    return {
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "chlorophyll": result["value"],
        "unit": result["unit"],
        "depth": 0.494025,
        "timestamp": result["timestamp"],
        "source": result["source"],
        "dataset": result["dataset"],
    }


# ============================================================
# WAVE HEIGHT
# ============================================================

def get_nearest_wave(latitude, longitude):

    result = get_latest_valid_copernicus_value(
        latitude,
        longitude,
        dataset_id=(
            "cmems_mod_glo_wav_"
            "anfc_0.083deg_PT3H-i"
        ),
        variable="VHM0",
        unit="m",
        use_depth=False,
    )

    if result is None:
        return None

    return {
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "wave_height": result["value"],
        "unit": result["unit"],
        "timestamp": result["timestamp"],
        "source": result["source"],
        "dataset": result["dataset"],
    }


def get_nearest_current(latitude, longitude):
    ds = xr.open_dataset("test-data/currents-area.nc")

    uo = ds["uo"].squeeze()
    vo = ds["vo"].squeeze()

    latitudes = ds["latitude"].values
    longitudes = ds["longitude"].values

    u_values = uo.values
    v_values = vo.values

    valid_indices = np.argwhere(
        np.isfinite(u_values) & np.isfinite(v_values)
    )

    if len(valid_indices) == 0:
        ds.close()
        return None

    nearest_index = None
    nearest_distance = float("inf")

    for index in valid_indices:
        lat_index = index[0]
        lon_index = index[1]

        data_lat = float(latitudes[lat_index])
        data_lon = float(longitudes[lon_index])

        distance = (
            (data_lat - latitude) ** 2
            + (data_lon - longitude) ** 2
        )

        if distance < nearest_distance:
            nearest_distance = distance
            nearest_index = (lat_index, lon_index)

    lat_index, lon_index = nearest_index

    u = float(u_values[lat_index, lon_index])
    v = float(v_values[lat_index, lon_index])

    speed = float(np.sqrt(u**2 + v**2))

    # Direction the current is moving toward
    direction = float(
        (np.degrees(np.arctan2(u, v)) + 360) % 360
    )

    result = {
        "latitude": float(latitudes[lat_index]),
        "longitude": float(longitudes[lon_index]),
        "u": u,
        "v": v,
        "speed": speed,
        "direction": direction,
        "unit": "m/s",
        "timestamp": str(ds["time"].values[0])[:10],
        "source": "Copernicus Marine",
    }

    ds.close()

    return result




# ============================================================
# GEBCO SEAFLOOR BATHYMETRY
# ============================================================

GEBCO_WMS_URL = "https://wms.gebco.net/mapserv"
GEBCO_WMS_LAYER = "GEBCO_Latest_2"

_BATHYMETRY_CACHE = {}
_BATHYMETRY_CACHE_TTL_SECONDS = 3600


def get_seafloor_depth(latitude, longitude):
    """Get the GEBCO elevation at the clicked point and expose ocean depth."""
    import time

    latitude = float(latitude)
    longitude = float(longitude)

    # Keep longitude inside the conventional WGS84 range used by the WMS.
    if longitude > 180:
        longitude -= 360
    elif longitude < -180:
        longitude += 360

    cache_key = (round(latitude, 5), round(longitude, 5))
    cached = _BATHYMETRY_CACHE.get(cache_key)
    if cached is not None:
        cached_time, cached_result = cached
        if time.time() - cached_time < _BATHYMETRY_CACHE_TTL_SECONDS:
            return cached_result.copy()

    # A small 3x3 WMS request lets the centre pixel represent the clicked point.
    # For WMS 1.3.0 + EPSG:4326, BBOX is latitude,longitude order.
    delta = 0.0005

    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetFeatureInfo",
        "layers": GEBCO_WMS_LAYER,
        "query_layers": GEBCO_WMS_LAYER,
        "styles": "",
        "crs": "EPSG:4326",
        "bbox": (
            f"{latitude - delta},{longitude - delta},"
            f"{latitude + delta},{longitude + delta}"
        ),
        "width": 3,
        "height": 3,
        "i": 1,
        "j": 1,
        "info_format": "text/plain",
        "feature_count": 1,
    }

    try:
        response = requests.get(
            GEBCO_WMS_URL,
            params=params,
            timeout=20,
            headers={
                "User-Agent": "SAMUDRA-Ocean-Intelligence/1.0",
                "Accept": "text/plain,text/html,application/json,*/*",
            },
        )
        response.raise_for_status()

        body = response.text.strip()

        # GEBCO GetFeatureInfo formats can vary. Prefer a labelled numeric
        # value, then fall back to the first numeric value in the response.
        elevation = None

        labelled_patterns = [
            r"(?:elevation|value|gev|gebco)[^-\d]*(-?\d+(?:\.\d+)?)",
            r"(?:elevation|value|gev|gebco)[^-\d]*(-?\d+)",
        ]

        for pattern in labelled_patterns:
            match = re.search(pattern, body, flags=re.IGNORECASE)
            if match:
                elevation = float(match.group(1))
                break

        if elevation is None:
            numbers = re.findall(r"-?\d+(?:\.\d+)?", body)
            if numbers:
                elevation = float(numbers[-1])

        if elevation is None or not np.isfinite(elevation):
            raise ValueError(
                "GEBCO did not return a numeric elevation. "
                f"Response: {body[:300]}"
            )

        elevation_m = float(elevation)
        depth_m = max(0.0, -elevation_m)

        result = {
            "latitude": latitude,
            "longitude": longitude,
            "depth_m": depth_m,
            "elevation_m": elevation_m,
            "unit": "m",
            "source": "GEBCO",
            "dataset": GEBCO_WMS_LAYER,
            "status": "ok",
        }

        _BATHYMETRY_CACHE[cache_key] = (time.time(), result)
        return result.copy()

    except Exception as error:
        print(
            f"GEBCO bathymetry error at "
            f"({latitude}, {longitude}): {error}"
        )

        return {
            "latitude": latitude,
            "longitude": longitude,
            "depth_m": None,
            "elevation_m": None,
            "unit": "m",
            "source": "GEBCO",
            "dataset": GEBCO_WMS_LAYER,
            "status": "error",
            "error": str(error),
        }

def get_temperature_depth_profile(latitude, longitude):
    """Fetch the latest Copernicus temperature profile at the nearest
    model grid cell to the clicked latitude/longitude."""
    dataset_id = "cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_time = now - timedelta(days=COPERNICUS_DAYS_BACK)
    area = COPERNICUS_AREA_SIZE
    dataset = None

    try:
        dataset = copernicusmarine.open_dataset(
            dataset_id=dataset_id,
            variables=["thetao"],
            minimum_longitude=longitude - area,
            maximum_longitude=longitude + area,
            minimum_latitude=latitude - area,
            maximum_latitude=latitude + area,
            minimum_depth=0,
            maximum_depth=6000,
            start_datetime=start_time.isoformat(),
            end_datetime=now.isoformat(),
            coordinates_selection_method="nearest",
        )

        if "time" not in dataset.coords or "depth" not in dataset.coords:
            return None

        values = dataset["thetao"].compute()
        time_index = len(dataset.time) - 1
        time_value = dataset.time.values[time_index]
        values = values.isel(time=time_index)

        latitudes = dataset.latitude.values
        longitudes = dataset.longitude.values
        lat_index = int(np.abs(latitudes - latitude).argmin())
        lon_index = int(np.abs(longitudes - longitude).argmin())

        column = values[:, lat_index, lon_index].values
        depths = dataset.depth.values
        profile = []

        for depth, value in zip(depths, column):
            if np.isfinite(value):
                profile.append({
                    "depth": float(depth),
                    "temperature": float(value),
                    "unit": "°C",
                })

        if not profile:
            return None

        surface = profile[0]

        return {
            "requested_latitude": float(latitude),
            "requested_longitude": float(longitude),
            "latitude": float(latitudes[lat_index]),
            "longitude": float(longitudes[lon_index]),
            "surface_temperature": float(surface["temperature"]),
            "surface_depth": float(surface["depth"]),
            "timestamp": str(time_value),
            "source": "Copernicus Marine",
            "dataset": dataset_id,
            "profile": profile,
        }

    except Exception as error:
        print(
            f"Copernicus temperature profile error at "
            f"({latitude}, {longitude}): {error}"
        )
        return None

    finally:
        if dataset is not None:
            try:
                dataset.close()
            except Exception:
                pass



# ============================================================
# INCOIS PFZ DATA + OFFICIAL GEOSERVER WMS
# ============================================================

_PFZ_CACHE = None
_PFZ_CACHE_TIME = None
_PFZ_CACHE_TTL_SECONDS = 900

_PFZ_SERVICE_CACHE = None
_PFZ_SERVICE_CACHE_TIME = None
_PFZ_SERVICE_CACHE_TTL_SECONDS = 900

INCOIS_PFZ_ADVISORY_PAGE = (
    "https://www.incois.gov.in/MarineFisheries/"
    "TextDataHome?mfid=1&request_locale=en"
)

INCOIS_PFZ_WEBGIS = "https://incois.gov.in/geoportal/MFASPFZ/index.html"

# This is the GeoServer endpoint used by the INCOIS geospatial stack.
# The exact PFZ layer name is discovered from its WMS GetCapabilities
# document instead of being guessed/hard-coded.
INCOIS_GEOSERVER_OWS = os.getenv(
    "INCOIS_GEOSERVER_OWS",
    "https://incois.gov.in/geoserver/ows",
)

INCOIS_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/154.0.0.0 Safari/537.36"
    ),
    "Accept": "application/xml,text/xml,text/html,*/*;q=0.8",
    "Referer": INCOIS_PFZ_WEBGIS,
    "Origin": "https://incois.gov.in",
}


def _local_name(tag):
    """Return an XML tag name without an XML namespace."""
    return tag.rsplit("}", 1)[-1]


def _extract_incois_gis_endpoints_from_webgis():
    """Discover GIS service URLs from the official INCOIS PFZ WebGIS.

    The public INCOIS GeoServer OWS endpoint currently returns HTTP 403 to
    automated clients.  The official PFZ WebGIS itself is reachable, so we
    inspect its HTML and JavaScript assets for the actual GIS service URL
    used by that application.  No PFZ layer name is invented here.
    """
    candidates = []

    def add_candidate(value, base_url):
        if not value:
            return
        value = value.strip().strip("'\"")
        if not value:
            return
        if value.startswith('//'):
            value = 'https:' + value
        elif value.startswith('/'):
            value = urljoin(base_url, value)
        elif not value.lower().startswith(('http://', 'https://')):
            value = urljoin(base_url, value)

        low = value.lower()
        if not any(token in low for token in ('wms', 'ows', 'geoserver', 'mapserver')):
            return
        if value not in candidates:
            candidates.append(value)

    try:
        page = requests.get(
            INCOIS_PFZ_WEBGIS,
            timeout=30,
            headers=INCOIS_BROWSER_HEADERS,
        )
        print('PFZ WEBGIS HTML STATUS:', page.status_code)
        print('PFZ WEBGIS HTML LENGTH:', len(page.content))
        page.raise_for_status()

        html = page.text

        # URLs explicitly embedded in HTML/inline JavaScript.
        for match in re.findall(r'https?://[^\"\'\s<>]+', html, flags=re.I):
            add_candidate(match, INCOIS_PFZ_WEBGIS)

        # Relative service strings in inline JavaScript.
        for match in re.findall(
            r'[\"\']([^\"\']*(?:wms|ows|geoserver|mapserver)[^\"\']*)[\"\']',
            html,
            flags=re.I,
        ):
            add_candidate(match, INCOIS_PFZ_WEBGIS)

        # Fetch every JavaScript asset advertised by the official page.
        script_srcs = re.findall(
            r'<script[^>]+src=[\"\']([^\"\']+)[\"\']',
            html,
            flags=re.I,
        )
        print('PFZ WEBGIS SCRIPT COUNT:', len(script_srcs))

        for src in script_srcs:
            script_url = urljoin(INCOIS_PFZ_WEBGIS, src)
            try:
                js = requests.get(
                    script_url,
                    timeout=20,
                    headers=INCOIS_BROWSER_HEADERS,
                )
                print('PFZ JS:', script_url, 'STATUS:', js.status_code, 'LENGTH:', len(js.content))
                if not js.ok:
                    continue

                body = js.text

                for match in re.findall(r'https?://[^\"\'\s<>]+', body, flags=re.I):
                    add_candidate(match, script_url)

                for match in re.findall(
                    r'[\"\']([^\"\']*(?:wms|ows|geoserver|mapserver)[^\"\']*)[\"\']',
                    body,
                    flags=re.I,
                ):
                    add_candidate(match, script_url)

            except requests.RequestException as exc:
                print('PFZ JS FETCH ERROR:', script_url, exc)

    except requests.RequestException as exc:
        print('PFZ WEBGIS DISCOVERY ERROR:', exc)

    # Remove obvious static asset URLs and duplicate query variants.
    filtered = []
    for candidate in candidates:
        low = candidate.lower()
        if any(low.endswith(ext) for ext in ('.js', '.css', '.png', '.jpg', '.jpeg', '.gif')):
            continue
        if candidate not in filtered:
            filtered.append(candidate)

    print('PFZ DISCOVERED GIS ENDPOINT CANDIDATES:')
    for candidate in filtered:
        print('  ', candidate)
    return filtered


def _get_wms_capabilities(endpoint):
    """Return parsed WMS capabilities XML for an endpoint, or None."""
    response = requests.get(
        endpoint,
        params={
            'service': 'WMS',
            'request': 'GetCapabilities',
            'version': '1.3.0',
        },
        headers=INCOIS_BROWSER_HEADERS,
        timeout=30,
    )

    print('WMS TEST:', endpoint, 'STATUS:', response.status_code, 'TYPE:', response.headers.get('Content-Type'))
    print('WMS RESPONSE LENGTH:', len(response.content))

    if not response.ok:
        print('WMS RESPONSE BODY:', response.text[:500])
        return None

    import xml.etree.ElementTree as ET
    try:
        return ET.fromstring(response.content)
    except ET.ParseError:
        print('WMS endpoint did not return XML:', response.text[:500])
        return None


def _find_pfz_layers(root):
    candidates = []

    def visit(element, parent_title=None):
        if _local_name(element.tag) != 'Layer':
            for child in list(element):
                visit(child, parent_title)
            return

        name = None
        title = None
        for child in list(element):
            tag = _local_name(child.tag)
            if tag == 'Name' and child.text:
                name = child.text.strip()
            elif tag == 'Title' and child.text:
                title = child.text.strip()

        effective_title = title or parent_title or ''
        haystack = f'{name or ""} {effective_title}'.lower()

        if name and (
            'pfz' in haystack
            or 'potential fishing' in haystack
            or 'fishing zone' in haystack
        ):
            candidates.append({
                'layer': name,
                'title': title or name,
                'parent_title': parent_title,
            })

        for child in list(element):
            if _local_name(child.tag) == 'Layer':
                visit(child, title or parent_title)

    visit(root)
    return candidates


def discover_incois_pfz_service(force_refresh=False):
    """Discover the official INCOIS PFZ WMS used by the official WebGIS."""
    global _PFZ_SERVICE_CACHE, _PFZ_SERVICE_CACHE_TIME

    now = datetime.now(timezone.utc)
    if (
        not force_refresh
        and _PFZ_SERVICE_CACHE is not None
        and _PFZ_SERVICE_CACHE_TIME is not None
        and (now - _PFZ_SERVICE_CACHE_TIME).total_seconds() < _PFZ_SERVICE_CACHE_TTL_SECONDS
    ):
        return _PFZ_SERVICE_CACHE

    print('\n==============================')
    print('INCOIS PFZ SERVICE DISCOVERY')
    print('==============================')

    # First try the endpoint supplied via environment variable. This keeps
    # deployments that already know the correct endpoint working.
    endpoints = [INCOIS_GEOSERVER_OWS]

    # Then inspect the actual official WebGIS application for the endpoint it
    # uses. This is the important fallback because the generic GeoServer OWS
    # URL is currently WAF-blocked.
    for discovered in _extract_incois_gis_endpoints_from_webgis():
        if discovered not in endpoints:
            endpoints.append(discovered)

    seen = set()
    for endpoint in endpoints:
        if endpoint in seen:
            continue
        seen.add(endpoint)

        try:
            root = _get_wms_capabilities(endpoint)
            if root is None:
                continue

            candidates = _find_pfz_layers(root)
            print('PFZ CANDIDATE COUNT FOR', endpoint, ':', len(candidates))
            for candidate in candidates:
                print('PFZ CANDIDATE:', candidate)

            if not candidates:
                continue

            candidates.sort(
                key=lambda item: (
                    0 if 'pfz advisory' in item['title'].lower() else 1,
                    0 if 'potential fishing' in item['title'].lower() else 1,
                )
            )
            selected = candidates[0]

            result = {
                'source': 'INCOIS',
                'service': 'Potential Fishing Zone Advisory',
                'wms_url': endpoint,
                'layer': selected['layer'],
                'title': selected['title'],
                'webgis_url': INCOIS_PFZ_WEBGIS,
                'official': True,
            }

            print('SELECTED OFFICIAL PFZ SERVICE:', result)
            _PFZ_SERVICE_CACHE = result
            _PFZ_SERVICE_CACHE_TIME = now
            return result

        except requests.RequestException as exc:
            print('PFZ ENDPOINT REQUEST ERROR:', endpoint, exc)
        except Exception as exc:
            print('PFZ ENDPOINT ERROR:', endpoint, exc)

    return {
        'source': 'INCOIS',
        'service': 'Potential Fishing Zone Advisory',
        'wms_url': None,
        'layer': None,
        'title': None,
        'webgis_url': INCOIS_PFZ_WEBGIS,
        'official': True,
        'error': (
            'Could not discover an accessible official INCOIS PFZ WMS endpoint. '
            'The generic INCOIS GeoServer OWS endpoint is currently returning '
            'HTTP 403 to automated requests, and the official WebGIS assets did '
            'not expose another accessible WMS endpoint.'
        ),
    }


def get_incois_pfz_data():
    """Return current INCOIS PFZ advisory metadata + official WMS layer."""
    global _PFZ_CACHE, _PFZ_CACHE_TIME

    now = datetime.now(timezone.utc)
    if (
        _PFZ_CACHE is not None
        and _PFZ_CACHE_TIME is not None
        and (now - _PFZ_CACHE_TIME).total_seconds() < _PFZ_CACHE_TTL_SECONDS
    ):
        return _PFZ_CACHE

    page_url = INCOIS_PFZ_ADVISORY_PAGE
    webgis_url = INCOIS_PFZ_WEBGIS

    try:
        response = requests.get(
            page_url,
            timeout=20,
            headers={
                "User-Agent": "SAMUDRA-Ocean-Intelligence/1.0"
            },
        )
        response.raise_for_status()

        from bs4 import BeautifulSoup
        import re

        soup = BeautifulSoup(response.text, "html.parser")
        text = " ".join(soup.stripped_strings)

        forecast_date = None
        valid_upto = None

        date_matches = re.findall(
            r"\b\d{1,2}\s+[A-Z]{3}\s+\d{4}\b",
            text.upper(),
        )
        if len(date_matches) >= 2:
            forecast_date = date_matches[-2]
            valid_upto = date_matches[-1]

        image_url = None
        for image in soup.find_all("img"):
            src = image.get("src")
            if not src:
                continue
            if "MFS" in src.upper() or "PFZ" in src.upper():
                image_url = requests.compat.urljoin(page_url, src)
                break

        service = discover_incois_pfz_service()

        result = {
            "source": "INCOIS",
            "service": "Potential Fishing Zone Advisory",
            "forecast_date": forecast_date,
            "valid_upto": valid_upto,
            "advisory_url": page_url,
            "webgis_url": webgis_url,
            "image_url": image_url,
            "official_wms": service,
            "pfz_layer": service.get("layer"),
            "note": (
                "PFZ is loaded in SAMUDRA from the official INCOIS "
                "geospatial service through a local WMS proxy."
            ),
        }

        if service.get("error"):
            result["wms_error"] = service["error"]

        _PFZ_CACHE = result
        _PFZ_CACHE_TIME = now
        return result

    except Exception as error:
        print(f"INCOIS PFZ error: {error}")
        return {
            "source": "INCOIS",
            "service": "Potential Fishing Zone Advisory",
            "forecast_date": None,
            "valid_upto": None,
            "advisory_url": page_url,
            "webgis_url": webgis_url,
            "image_url": None,
            "official_wms": discover_incois_pfz_service(),
            "pfz_layer": None,
            "error": str(error),
        }


@app.get("/pfz-service")
def pfz_service():
    """Return the discovered official INCOIS PFZ WMS layer."""
    result = discover_incois_pfz_service()

    if not result.get("layer"):
        raise HTTPException(
            status_code=502,
            detail=result.get(
                "error",
                "Official INCOIS PFZ layer could not be discovered.",
            ),
        )

    return result


@app.get("/incois-pfz-wms")
def incois_pfz_wms(request: Request):
    """Proxy Cesium WMS GetMap requests to the official INCOIS WebGIS WMS."""
    service = discover_incois_pfz_service()
    layer_name = service.get("layer")
    wms_url = service.get("wms_url")

    if not layer_name or not wms_url:
        raise HTTPException(
            status_code=502,
            detail=service.get(
                "error",
                "Official INCOIS PFZ layer could not be discovered.",
            ),
        )

    query = dict(request.query_params)
    query["service"] = "WMS"
    query["request"] = "GetMap"
    query["layers"] = layer_name
    query.setdefault("version", "1.1.1")
    query.setdefault("format", "image/png")
    query.setdefault("transparent", "true")
    query.setdefault("srs", "EPSG:4326")

    try:
        upstream = requests.get(
            wms_url,
            params=query,
            headers={
                **INCOIS_BROWSER_HEADERS,
                "Accept": "image/png,image/*;q=0.8,*/*;q=0.5",
            },
            timeout=45,
        )

        content_type = upstream.headers.get(
            "Content-Type",
            "image/png",
        )

        if not upstream.ok:
            raise HTTPException(
                status_code=502,
                detail=(
                    "INCOIS GeoServer WMS returned "
                    f"HTTP {upstream.status_code}."
                ),
            )

        return Response(
            content=upstream.content,
            media_type=content_type.split(";")[0],
        )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"INCOIS PFZ WMS proxy error: {error}",
        )


@app.get("/pfz-data")
def pfz_data():
    return get_incois_pfz_data()


@app.get("/")
def root():
    return {
        "message": "SAMUDRA Ocean API is running"
    }


@app.get("/gebco-bathymetry-wms")
def gebco_bathymetry_wms(request: Request):
    """
    Proxy GEBCO's global WMS so the Cesium browser client does not have
    to request the external WMS directly.

    Cesium sends the GeographicTilingScheme BBOX as:
        west, south, east, north

    GEBCO WMS 1.3.0 with EPSG:4326 expects:
        south, west, north, east
    """
    params = dict(request.query_params)

    # Keep the request locked to the GEBCO bathymetry layer.
    params["service"] = "WMS"
    params["version"] = "1.3.0"
    params["request"] = "GetMap"
    params["layers"] = GEBCO_WMS_LAYER
    params["styles"] = ""
    params["crs"] = "EPSG:4326"
    params["format"] = "image/png"
    params["transparent"] = "true"

    bbox_key = "BBOX" if "BBOX" in params else "bbox"
    bbox = params.get(bbox_key)

    if bbox:
        try:
            west, south, east, north = [
                float(value) for value in bbox.split(",")
            ]

            # WMS 1.3.0 + EPSG:4326 uses latitude,longitude
            # axis order, while Cesium's geographic tiling scheme
            # supplies longitude,latitude order.
            params["BBOX"] = (
                f"{south},{west},{north},{east}"
            )

            if bbox_key == "bbox":
                params.pop("bbox", None)

        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Invalid GEBCO BBOX"
            )

    try:
        response = requests.get(
            GEBCO_WMS_URL,
            params=params,
            timeout=30,
            headers={
                "User-Agent": "SAMUDRA-Ocean-Intelligence/1.0",
                "Accept": "image/png,image/*,*/*",
            },
        )

        response.raise_for_status()

        content_type = response.headers.get(
            "content-type",
            "image/png"
        ).split(";")[0]

        return Response(
            content=response.content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=3600"
            },
        )

    except requests.exceptions.RequestException as error:
        print(
            f"GEBCO WMS proxy error: {error}"
        )

        raise HTTPException(
            status_code=502,
            detail=f"GEBCO WMS request failed: {error}"
        )


@app.get("/ocean")
def get_ocean_data(latitude: float, longitude: float):

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            "temperature_profile": executor.submit(get_temperature_depth_profile, latitude, longitude),
            "salinity": executor.submit(get_nearest_salinity, latitude, longitude),
            "chlorophyll": executor.submit(get_nearest_chlorophyll, latitude, longitude),
            "wave": executor.submit(get_nearest_wave, latitude, longitude),
            "bathymetry": executor.submit(get_seafloor_depth, latitude, longitude),
        }

        temperature_profile = futures["temperature_profile"].result()
        salinity = futures["salinity"].result()
        chlorophyll = futures["chlorophyll"].result()
        wave = futures["wave"].result()
        bathymetry = futures["bathymetry"].result()

    temperature = None
    if temperature_profile is not None:
        temperature = {
            "latitude": temperature_profile["latitude"],
            "longitude": temperature_profile["longitude"],
            "temperature": temperature_profile["surface_temperature"],
            "unit": "°C",
            "depth": temperature_profile["surface_depth"],
            "timestamp": temperature_profile["timestamp"],
            "source": temperature_profile["source"],
            "dataset": temperature_profile["dataset"],
        }

    current = get_nearest_current(latitude, longitude)

    return {
        "requested_location": {"latitude": latitude, "longitude": longitude},
        "temperature_data": temperature,
        "temperature_profile_data": temperature_profile,
        "salinity_data": salinity,
        "chlorophyll_data": chlorophyll,
        "wave_data": wave,
        "current_data": current,
        "bathymetry_data": bathymetry,
    }

@app.get("/depth-profile")
def get_depth_profile(latitude: float, longitude: float):

    profile = get_temperature_depth_profile(
        latitude,
        longitude
    )

    return {
        "requested_location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "temperature_depth_profile": profile
    }

# =========================================================
# GLOBAL FISHING WATCH - AIS VESSEL PRESENCE
# =========================================================

def get_gfw_date_range():
    # GFW AIS vessel presence is available with an approximately
    # 96-hour delay. Use the latest complete 7-day window.
    now = datetime.now(timezone.utc)
    end_date = (now - timedelta(hours=96)).date()
    start_date = end_date - timedelta(days=7)
    return start_date.isoformat(), end_date.isoformat()


def get_gfw_vessel_style_url():
    global _gfw_style_url
    global _gfw_style_range

    if not GFW_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GFW_API_KEY is missing from backend/.env",
        )

    start_date, end_date = get_gfw_date_range()
    date_range = f"{start_date},{end_date}"

    if (
        _gfw_style_url
        and _gfw_style_range == date_range
    ):
        return _gfw_style_url

    url = (
        f"{GFW_API_BASE}/v3/4wings/generate-png"
    )

    params = {
        "interval": "DAY",
        "datasets[0]": "public-global-presence:latest",
        "color": "#0066cc",
        "date-range": date_range,
    }

    headers = {
        "Authorization": f"Bearer {GFW_API_KEY}"
    }

    try:
        # Try a direct connection first. This avoids problematic inherited
        # proxy settings while keeping normal TLS certificate verification.
        response = _gfw_direct_session.post(
            url,
            params=params,
            headers=headers,
            timeout=(15, 60),
        )
    except requests.exceptions.RequestException as direct_error:
        # If the machine requires a configured proxy, try the normal
        # environment-aware session as a fallback.
        try:
            response = _gfw_env_session.post(
                url,
                params=params,
                headers=headers,
                timeout=(15, 60),
            )
        except requests.exceptions.RequestException as env_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not connect to Global Fishing Watch. "
                    f"Direct connection error: {direct_error}. "
                    f"Environment/proxy connection error: {env_error}"
                ),
            )

    if not response.ok:
        raise HTTPException(
            status_code=response.status_code,
            detail=(
                "Global Fishing Watch style request failed: "
                + response.text[:1000]
            ),
        )

    data = response.json()
    style_url = data.get("url")

    if not style_url:
        raise HTTPException(
            status_code=502,
            detail="Global Fishing Watch returned no tile URL",
        )

    _gfw_style_url = style_url
    _gfw_style_range = date_range

    return style_url


@app.get("/gfw-vessel-tile/{z}/{x}/{y}")
def gfw_vessel_tile(z: int, x: int, y: int):
    if z < 0 or z > 12:
        raise HTTPException(
            status_code=400,
            detail="GFW zoom must be between 0 and 12",
        )

    if x < 0 or y < 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid tile coordinates",
        )

    tile_template = get_gfw_vessel_style_url()

    tile_url = (
        tile_template
        .replace("{z}", str(z))
        .replace("{x}", str(x))
        .replace("{y}", str(y))
    )

    try:
        # Direct HTTPS connection first. Do not use verify=False; the reported
        # UNEXPECTED_EOF_WHILE_READING is a TLS connection problem, not a
        # certificate-verification problem.
        response = _gfw_direct_session.get(
            tile_url,
            headers={
                "Authorization": f"Bearer {GFW_API_KEY}"
            },
            timeout=(15, 60),
        )
    except requests.exceptions.RequestException as direct_error:
        # Fallback for networks that require an HTTP(S) proxy configured in
        # the Windows environment.
        try:
            response = _gfw_env_session.get(
                tile_url,
                headers={
                    "Authorization": f"Bearer {GFW_API_KEY}"
                },
                timeout=(15, 60),
            )
        except requests.exceptions.RequestException as env_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not download the Global Fishing Watch vessel tile. "
                    f"Direct connection error: {direct_error}. "
                    f"Environment/proxy connection error: {env_error}"
                ),
            )

    if not response.ok:
        raise HTTPException(
            status_code=response.status_code,
            detail=(
                "Global Fishing Watch vessel tile failed: "
                + response.text[:1000]
            ),
        )

    return Response(
        content=response.content,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600"
        },
    )


@app.get("/gfw-vessel-status")
def gfw_vessel_status():
    if not GFW_API_KEY:
        return {
            "configured": False,
            "message": "GFW_API_KEY is missing",
        }

    start_date, end_date = get_gfw_date_range()

    return {
        "configured": True,
        "dataset": "public-global-presence:latest",
        "date_range": f"{start_date},{end_date}",
        "source": "Global Fishing Watch",
        "note": (
            "AIS vessel presence is aggregated vessel-hours, "
            "not individual live vessel positions."
        ),
    }


@app.get("/argo-test")
def argo_test():
    url = "https://argovis-api.colorado.edu/argo"

    params = {
        "startDate": "2026-09-01T00:00:00Z",
        "endDate": "2026-09-28T23:59:59Z",

        # Larger Indian Ocean region
        "polygon": "[[60,-5],[100,-5],[100,25],[60,25],[60,-5]]",
        "data": "pressure,temperature,salinity"
    }

    response = requests.get(
        url,
        params=params,
        timeout=60
    )

    if not response.ok:
        return {
            "status": response.status_code,
            "error": response.text
        }

    profiles = response.json()

    return {
        "source": "Argo / Argovis",
        "count": len(profiles),
        "profiles": profiles
    }


@app.get("/argo-profile/{profile_id}")
def argo_profile(profile_id: str):

    url = f"https://argovis-api.colorado.edu/argo"

    params = {
        "id": profile_id
    }

    response = requests.get(
        url,
        params=params,
        timeout=60
    )

    if not response.ok:
        return {
            "status": response.status_code,
            "error": response.text
        }

    return {
        "source": "Argo / Argovis",
        "profile": response.json()
    }

@app.get("/argo-profile-data/{float_id}/{cycle}")
def argo_profile_data(float_id: str, cycle: str):

    cycle = str(cycle).zfill(3)
    profile_id = f"{float_id}_{cycle}"

    url = "https://argovis-api.colorado.edu/argo"

    params = {
        "id": profile_id,
        "data": "pressure,temperature,salinity"
    }

    try:

        response = requests.get(
            url,
            params=params,
            timeout=60
        )

        if not response.ok:
            return {
                "error": f"Argovis returned {response.status_code}",
                "details": response.text
            }

        data = response.json()

        print("\n==============================")
        print("ARGO PROFILE:", profile_id)
        print("==============================")

        if isinstance(data, list):
            if len(data) == 0:
                return {
                    "error": "ARGO profile not found",
                    "profile_id": profile_id
                }
            profile = data[0]
        else:
            profile = data

        if not isinstance(profile, dict):
            return {
                "error": "Unexpected Argovis profile format",
                "profile_id": profile_id
            }

        # -----------------------------------------------------
        # LOCATION
        # -----------------------------------------------------

        coordinates = (
            profile.get("geolocation", {})
            .get("coordinates", [])
        )

        longitude = None
        latitude = None

        if isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
            try:
                longitude = float(coordinates[0])
                latitude = float(coordinates[1])
            except (TypeError, ValueError):
                pass

        # -----------------------------------------------------
        # ARGOVIS DATA FORMAT
        #
        # Argovis commonly returns:                         
        #   data_info = [["pressure", "temperature", ...]]
        #   data      = [[pressure values], [temperature values], ...]
        #
        # Therefore data is column-oriented, not row-oriented.
        # -----------------------------------------------------

        data_info = profile.get("data_info", [])
        raw_data = profile.get("data", [])

        print("DATA INFO:")
        print(data_info)
        print("DATA TYPE:", type(raw_data))

        variables = []

        if (
            isinstance(data_info, list)
            and len(data_info) > 0
            and isinstance(data_info[0], list)
        ):
            variables = data_info[0]
        elif isinstance(data_info, list):
            variables = data_info

        print("VARIABLES:")
        print(variables)

        pressure_index = None
        temperature_index = None
        salinity_index = None

        for index, variable in enumerate(variables):
            name = str(variable).lower().strip()

            if pressure_index is None and name in {
                "pressure", "pres", "pres_adjusted", "pressure_adjusted"
            }:
                pressure_index = index

            if temperature_index is None and name in {
                "temperature", "temp", "temp_adjusted", "temperature_adjusted"
            }:
                temperature_index = index

            if salinity_index is None and name in {
                "salinity", "psal", "psal_adjusted", "salinity_adjusted"
            }:
                salinity_index = index

        print("Pressure index:", pressure_index)
        print("Temperature index:", temperature_index)
        print("Salinity index:", salinity_index)

        profile_data = []

        # -----------------------------------------------------
        # COLUMN-ORIENTED ARGOVIS DATA
        # -----------------------------------------------------

        if (
            isinstance(raw_data, list)
            and pressure_index is not None
            and temperature_index is not None
            and salinity_index is not None
            and len(raw_data) > max(
                pressure_index,
                temperature_index,
                salinity_index
            )
        ):
            try:
                pressure_values = raw_data[pressure_index]
                temperature_values = raw_data[temperature_index]
                salinity_values = raw_data[salinity_index]

                if (
                    isinstance(pressure_values, list)
                    and isinstance(temperature_values, list)
                    and isinstance(salinity_values, list)
                ):
                    count = min(
                        len(pressure_values),
                        len(temperature_values),
                        len(salinity_values)
                    )

                    for i in range(count):
                        try:
                            pressure = float(pressure_values[i])
                            temperature = float(temperature_values[i])
                            salinity = float(salinity_values[i])
                        except (TypeError, ValueError):
                            continue

                        if not (
                            np.isfinite(pressure)
                            and np.isfinite(temperature)
                            and np.isfinite(salinity)
                        ):
                            continue

                        profile_data.append({
                            "pressure": pressure,
                            "temperature": temperature,
                            "salinity": salinity
                        })

            except Exception as e:
                print("Column extraction error:", str(e))

        # -----------------------------------------------------
        # ROW-ORIENTED FALLBACK
        # -----------------------------------------------------

        if not profile_data and isinstance(raw_data, list):
            for row in raw_data:
                if not isinstance(row, (list, tuple)):
                    continue

                try:
                    if (
                        pressure_index is None
                        or temperature_index is None
                        or salinity_index is None
                    ):
                        continue

                    pressure = float(row[pressure_index])
                    temperature = float(row[temperature_index])
                    salinity = float(row[salinity_index])

                except (IndexError, TypeError, ValueError):
                    continue

                if not (
                    np.isfinite(pressure)
                    and np.isfinite(temperature)
                    and np.isfinite(salinity)
                ):
                    continue

                profile_data.append({
                    "pressure": pressure,
                    "temperature": temperature,
                    "salinity": salinity
                })

        # -----------------------------------------------------
        # DICT-ROW FALLBACK
        # -----------------------------------------------------

        if not profile_data and isinstance(raw_data, list):
            for row in raw_data:
                if not isinstance(row, dict):
                    continue

                pressure = row.get(
                    "pres",
                    row.get("pressure")
                )
                temperature = row.get(
                    "temp",
                    row.get("temperature")
                )
                salinity = row.get(
                    "psal",
                    row.get("salinity")
                )

                try:
                    pressure = float(pressure)
                    temperature = float(temperature)
                    salinity = float(salinity)
                except (TypeError, ValueError):
                    continue

                if not (
                    np.isfinite(pressure)
                    and np.isfinite(temperature)
                    and np.isfinite(salinity)
                ):
                    continue

                profile_data.append({
                    "pressure": pressure,
                    "temperature": temperature,
                    "salinity": salinity
                })

        # -----------------------------------------------------
        # SORT BY PRESSURE
        # -----------------------------------------------------

        profile_data.sort(
            key=lambda item: item["pressure"]
        )

        print("VALID MEASUREMENTS:", len(profile_data))

        return {
            "float_id": float_id,
            "cycle": cycle,
            "profile_id": profile_id,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": profile.get("timestamp"),
            "profile": profile_data,
            "source": "Argo / Argovis"
        }

    except Exception as e:

        print("ARGO PROFILE ERROR:", str(e))

        return {
            "error": str(e),
            "profile_id": profile_id
        }

