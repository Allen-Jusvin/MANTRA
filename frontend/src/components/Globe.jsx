import { useEffect, useRef } from "react";

import {
  Viewer,
  Ion,
  Cartesian3,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  WebMapServiceImageryProvider,
  GeographicTilingScheme,
  UrlTemplateImageryProvider,
  PolylineArrowMaterialProperty,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";


function Globe({
  onLocationSelect,
  activeLayer,
  currentData,
  argoProfiles = [],
  onArgoSelect,
  bathymetryEnabled,
  eezEnabled,
  vesselsEnabled,
  pfzEnabled,
}) {

  const containerRef =
    useRef(null);

  const viewerRef =
    useRef(null);


  // =========================================================
  // CREATE CESIUM GLOBE
  // =========================================================

  useEffect(() => {

    if (!containerRef.current) {
      return;
    }


    // -------------------------------------------------------
    // CESIUM TOKEN
    // -------------------------------------------------------

    const token =
      import.meta.env
        .VITE_CESIUM_TOKEN;


    if (token) {

      Ion.defaultAccessToken =
        token;

    }


    // -------------------------------------------------------
    // CREATE VIEWER
    // -------------------------------------------------------

    const viewer =
      new Viewer(
        containerRef.current,
        {

          animation: false,

          timeline: false,

          baseLayerPicker: false,

          geocoder: false,

          homeButton: false,

          sceneModePicker: false,

          navigationHelpButton: false,

          fullscreenButton: false,

          selectionIndicator: false,

          infoBox: false,

        }
      );


    // -------------------------------------------------------
    // GLOBE SETTINGS
    // -------------------------------------------------------

    viewer.scene.globe.enableLighting =
      true;


    viewer.scene.globe.baseColor =
      Color.fromCssColorString(
        "#071522"
      );


    // -------------------------------------------------------
    // INITIAL CAMERA
    // -------------------------------------------------------

    viewer.camera.setView({

      destination:
        Cartesian3.fromDegrees(
          78,
          10,
          18000000
        ),

    });


    // -------------------------------------------------------
    // SAVE VIEWER
    // -------------------------------------------------------

    viewerRef.current =
      viewer;


    // -------------------------------------------------------
    // CLICK HANDLER
    // -------------------------------------------------------

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );


    handler.setInputAction(
      (movement) => {

        // ---------------------------------------------------
        // FIRST: CHECK ARGO MARKER
        // ---------------------------------------------------

        const pickedObject =
          viewer.scene.pick(
            movement.position
          );


        if (
          pickedObject &&
          pickedObject.id &&
          pickedObject.id.properties &&
          pickedObject.id.properties
            .isArgo
        ) {

          const profileId =
            pickedObject.id.properties
              .profileId
              .getValue();


          const profile =
            argoProfiles.find(
              (item) =>
                item._id ===
                profileId
            );


          if (
            profile &&
            onArgoSelect
          ) {

            onArgoSelect(
              profile
            );

          }


          return;

        }


        // ---------------------------------------------------
        // NORMAL OCEAN CLICK
        // ---------------------------------------------------

        const cartesian =
          viewer.camera.pickEllipsoid(
            movement.position,
            viewer.scene.globe
              .ellipsoid
          );


        if (!cartesian) {
          return;
        }


        const cartographic =
          Cartographic.fromCartesian(
            cartesian
          );


        const longitude =
          CesiumMath.toDegrees(
            cartographic.longitude
          );


        const latitude =
          CesiumMath.toDegrees(
            cartographic.latitude
          );


        const location = {

          latitude,

          longitude,

        };


        console.log(
          "Selected ocean location:",
          location
        );


        if (onLocationSelect) {

          onLocationSelect(
            location
          );

        }

      },

      ScreenSpaceEventType.LEFT_CLICK

    );


    // -------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------

    return () => {

      handler.destroy();


      if (
        !viewer.isDestroyed()
      ) {

        viewer.destroy();

      }


      viewerRef.current =
        null;

    };

  }, [
    onLocationSelect,
    argoProfiles,
    onArgoSelect,
  ]);


  // =========================================================
  // COPERNICUS SEA-SURFACE TEMPERATURE LAYER
  // =========================================================

  useEffect(() => {

    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // Remove an older SAMUDRA temperature layer first.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraTemperature) {
        layers.remove(layer, true);
      }
    }

    // Temperature is shown only when the Temperature layer is active.
    if (activeLayer !== "temperature") {
      return;
    }

    try {
      // Copernicus Marine WMTS for the global daily mean potential
      // temperature dataset at the surface.
      // Dataset: cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m
      const temperatureUrl =
        "https://wmts.marine.copernicus.eu/teroWmts" +
        "?service=WMTS" +
        "&version=1.0.0" +
        "&request=GetTile" +
        "&layer=GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m_202406/thetao" +
        "&tilematrixset=EPSG:3857" +
        "&tilematrix={z}" +
        "&tilerow={y}" +
        "&tilecol={x}" +
        "&format=image/png" +
        "&elevation=0.494025" +
        "&STYLE=cmap:thermal,range=0/35,noClamp";

      const provider = new UrlTemplateImageryProvider({
        url: temperatureUrl,
        minimumLevel: 0,
        maximumLevel: 10,
        tileWidth: 256,
        tileHeight: 256,
        credit: "Copernicus Marine Service Information",
      });

      const layer = layers.addImageryProvider(provider);

      layer._samudraTemperature = true;
      layer.alpha = 0.72;

      console.log("SAMUDRA: Copernicus temperature layer enabled");
    } catch (error) {
      console.error(
        "SAMUDRA: Failed to load Copernicus temperature layer:",
        error
      );
    }

    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
        const layer = viewer.imageryLayers.get(i);

        if (layer && layer._samudraTemperature) {
          viewer.imageryLayers.remove(layer, true);
        }
      }
    };
  }, [activeLayer]);


  // =========================================================
  // COPERNICUS PRIMARY OCEAN SWELL LAYER
  // =========================================================

  useEffect(() => {

    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // Remove an older SAMUDRA swell layer first.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraSwell) {
        layers.remove(layer, true);
      }
    }

    // Swell is shown only when the Ocean Swell layer is active.
    if (activeLayer !== "swell") {
      return;
    }

    try {
      // Copernicus Marine global 3-hourly wave forecast/analysis dataset.
      // VHM0_SW1 = primary swell significant wave height (metres).
      const swellUrl =
        "https://wmts.marine.copernicus.eu/teroWmts" +
        "?service=WMTS" +
        "&version=1.0.0" +
        "&request=GetTile" +
        "&layer=GLOBAL_ANALYSISFORECAST_WAV_001_027/cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202411/VHM0_SW1" +
        "&tilematrixset=EPSG:3857" +
        "&tilematrix={z}" +
        "&tilerow={y}" +
        "&tilecol={x}" +
        "&format=image/png" +
        "&STYLE=cmap:cool,range=0/5,noClamp";

      const provider = new UrlTemplateImageryProvider({
        url: swellUrl,
        minimumLevel: 0,
        maximumLevel: 10,
        tileWidth: 256,
        tileHeight: 256,
        credit: "Copernicus Marine Service Information - Primary Swell",
      });

      const layer = layers.addImageryProvider(provider);

      layer._samudraSwell = true;
      layer.alpha = 0.78;

      console.log("SAMUDRA: Copernicus primary ocean swell layer enabled");
    } catch (error) {
      console.error(
        "SAMUDRA: Failed to load Copernicus ocean swell layer:",
        error
      );
    }

    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
        const layer = viewer.imageryLayers.get(i);

        if (layer && layer._samudraSwell) {
          viewer.imageryLayers.remove(layer, true);
        }
      }
    };
  }, [activeLayer]);


  // =========================================================
  // BATHYMETRY
  // =========================================================

  useEffect(() => {

    const viewer =
      viewerRef.current;


    if (!viewer) {
      return;
    }


    // -------------------------------------------------------
    // REMOVE OLD BATHYMETRY LAYERS
    // -------------------------------------------------------

    const layers =
      viewer.imageryLayers;


    for (
      let i =
        layers.length - 1;
      i >= 0;
      i--
    ) {

      const layer =
        layers.get(i);


      if (
        layer &&
        layer._samudraBathymetry
      ) {

        layers.remove(
          layer,
          true
        );

      }

    }


    // -------------------------------------------------------
    // IF DISABLED
    // -------------------------------------------------------

    if (
      !bathymetryEnabled
    ) {

      return;

    }


    // -------------------------------------------------------
    // GEBCO OFFICIAL WMS DIRECTLY
    //
    // GEBCO's current WMS endpoint now serves the GEBCO_2026
    // grid through the GEBCO_Latest layers. Using the official
    // WMS directly avoids routing every Cesium tile through
    // FastAPI, which can time out while GEBCO is generating tiles.
    // -------------------------------------------------------

    const provider =
      new WebMapServiceImageryProvider({

        url:
          "https://wms.gebco.net/mapserv?",

        layers:
          "GEBCO_Latest_2",

        tilingScheme:
          new GeographicTilingScheme(),

        parameters: {

          service: "WMS",

          version: "1.3.0",

          request: "GetMap",

          styles: "",

          crs: "EPSG:4326",

          format:
            "image/png",

          transparent:
            "true",

        },

        minimumLevel: 0,

        maximumLevel: 9,

      });


    // -------------------------------------------------------
    // ADD LAYER
    // -------------------------------------------------------

    const layer =
      layers.addImageryProvider(
        provider
      );


    layer._samudraBathymetry =
      true;

    layer.alpha = 0.95;


    console.log(
      "GEBCO Bathymetry enabled using official GEBCO WMS"
    );


    // -------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------

    return () => {

      if (
        viewer &&
        !viewer.isDestroyed()
      ) {

        for (
          let i =
            viewer.imageryLayers
              .length - 1;
          i >= 0;
          i--
        ) {

          const item =
            viewer.imageryLayers
              .get(i);


          if (
            item &&
            item._samudraBathymetry
          ) {

            viewer.imageryLayers.remove(
              item,
              true
            );

          }

        }

      }

    };

  }, [
    bathymetryEnabled
  ]);


  // =========================================================
  // EEZ BOUNDARIES
  // =========================================================

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // Remove any old EEZ layers first.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraEEZ) {
        layers.remove(layer, true);
      }
    }

    // If EEZ is disabled, stop here.
    if (!eezEnabled) {
      return;
    }

    // Marine Regions WMS:
    // eez_boundaries = Maritime Boundaries, version 12.
    try {
      const provider = new WebMapServiceImageryProvider({
        url: "https://geo.vliz.be/geoserver/MarineRegions/wms",
        layers: "eez_boundaries",
        parameters: {
          service: "WMS",
          version: "1.1.1",
          request: "GetMap",
          styles: "",
          format: "image/png",
          transparent: true,
        },
      });

      const layer = layers.addImageryProvider(provider);

      layer._samudraEEZ = true;
      layer.alpha = 0.95;

      console.log("SAMUDRA: EEZ Boundaries enabled");
    } catch (error) {
      console.error(
        "SAMUDRA: Failed to load EEZ Boundaries:",
        error
      );
    }

    // Cleanup when the checkbox changes or the component unmounts.
    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
        const layer = viewer.imageryLayers.get(i);

        if (layer && layer._samudraEEZ) {
          viewer.imageryLayers.remove(layer, true);
        }
      }
    };
  }, [eezEnabled]);


  // =========================================================
  // GLOBAL FISHING WATCH - VESSEL PRESENCE
  // =========================================================

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // Remove previous vessel layer.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraVessels) {
        layers.remove(layer, true);
      }
    }

    // If disabled, stop here.
    if (!vesselsEnabled) {
      return;
    }

    try {
      const provider = new UrlTemplateImageryProvider({
        url:
          "http://127.0.0.1:8000/gfw-vessel-tile/{z}/{x}/{y}",

        minimumLevel: 0,
        maximumLevel: 8,

        tileWidth: 256,
        tileHeight: 256,

        credit:
          "Vessel presence: Global Fishing Watch",
      });

      const layer =
        layers.addImageryProvider(provider);

      layer._samudraVessels = true;

      // Keep the ocean/bathymetry visible underneath.
      layer.alpha = 0.90;

      console.log(
        "SAMUDRA: GFW vessel presence enabled"
      );
    } catch (error) {
      console.error(
        "SAMUDRA: Failed to load GFW vessel layer:",
        error
      );
    }

    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (
        let i = viewer.imageryLayers.length - 1;
        i >= 0;
        i--
      ) {
        const layer =
          viewer.imageryLayers.get(i);

        if (layer && layer._samudraVessels) {
          viewer.imageryLayers.remove(
            layer,
            true
          );
        }
      }
    };
  }, [vesselsEnabled]);


  // =========================================================
  // OFFICIAL INCOIS PFZ WMS -> CESIUM
  // =========================================================

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // Remove any previous PFZ layer.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraPFZ) {
        layers.remove(layer, true);
      }
    }

    if (!pfzEnabled) {
      console.log("SAMUDRA: PFZ disabled");
      return;
    }

    let cancelled = false;

    const loadOfficialPFZ = async () => {
      try {
        console.log("SAMUDRA: Requesting /pfz-service...");

        const response = await fetch(
          "http://127.0.0.1:8000/pfz-service",
          {
            cache: "no-store",
          }
        );

        const rawText = await response.text();

        console.log(
          "SAMUDRA: /pfz-service HTTP status:",
          response.status
        );
        console.log(
          "SAMUDRA: /pfz-service raw response:",
          rawText
        );

        if (!response.ok) {
          throw new Error(
            `INCOIS PFZ service discovery failed (${response.status}): ${rawText}`
          );
        }

        let service;

        try {
          service = JSON.parse(rawText);
        } catch (parseError) {
          throw new Error(
            `INCOIS PFZ service returned invalid JSON: ${parseError.message}`
          );
        }

        if (cancelled) {
          return;
        }

        console.log("SAMUDRA: PFZ service object:", service);

        if (!service.layer) {
          throw new Error(
            service.error ||
              "INCOIS PFZ Advisory layer was not found"
          );
        }

        const provider = new WebMapServiceImageryProvider({
          url: "http://127.0.0.1:8000/incois-pfz-wms",
          layers: service.layer,
          parameters: {
            service: "WMS",
            version: "1.1.1",
            request: "GetMap",
            styles: "",
            format: "image/png",
            transparent: true,
            srs: "EPSG:4326",
          },
          credit: "Official INCOIS PFZ Advisory",
        });

        const layer = layers.addImageryProvider(provider);
        layer._samudraPFZ = true;
        layer.alpha = 0.92;

        console.log(
          "SAMUDRA: Official INCOIS PFZ layer enabled:",
          service.layer
        );
      } catch (error) {
        console.error(
          "SAMUDRA: Failed to load official INCOIS PFZ layer:",
          error
        );
      }
    };

    loadOfficialPFZ();

    return () => {
      cancelled = true;

      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
        const layer = viewer.imageryLayers.get(i);

        if (layer && layer._samudraPFZ) {
          viewer.imageryLayers.remove(layer, true);
        }
      }
    };
  }, [pfzEnabled]);


  // =========================================================
  // ARGO FLOAT MARKERS
  // =========================================================

  useEffect(() => {

    const viewer =
      viewerRef.current;


    if (!viewer) {
      return;
    }


    // -------------------------------------------------------
    // REMOVE OLD ARGO MARKERS
    // -------------------------------------------------------

    const entities =
      viewer.entities.values;


    for (
      let i =
        entities.length - 1;
      i >= 0;
      i--
    ) {

      const entity =
        entities[i];


      if (
        entity.properties &&
        entity.properties.isArgo
      ) {

        viewer.entities.remove(
          entity
        );

      }

    }


    // -------------------------------------------------------
    // ONLY SHOW WHEN ARGO LAYER ACTIVE
    // -------------------------------------------------------

    if (
      activeLayer !==
      "argo"
    ) {

      return;

    }


    // -------------------------------------------------------
    // ADD ARGO FLOATS
    // -------------------------------------------------------

    argoProfiles.forEach(
      (profile) => {

        try {

          const coordinates =
            profile
              ?.geolocation
              ?.coordinates;


          if (
            !coordinates ||
            coordinates.length < 2
          ) {

            return;

          }


          const longitude =
            Number(
              coordinates[0]
            );


          const latitude =
            Number(
              coordinates[1]
            );


          if (
            !Number.isFinite(
              latitude
            ) ||
            !Number.isFinite(
              longitude
            )
          ) {

            return;

          }


          const profileId =
            profile._id;


          if (!profileId) {
            return;
          }


          viewer.entities.add({

            id:
              `argo-${profileId}`,

            position:
              Cartesian3.fromDegrees(
                longitude,
                latitude,
                500
              ),


            point: {

              pixelSize:
                10,

              color:
                Color.CYAN,

              outlineColor:
                Color.WHITE,

              outlineWidth:
                2,

              disableDepthTestDistance:
                Number.POSITIVE_INFINITY,

            },


            properties: {

              isArgo: true,

              profileId:
                profileId,

            },


            description: `

              <b>ARGO FLOAT</b><br/>

              ID:
              ${profileId}<br/>

              Latitude:
              ${latitude.toFixed(4)}°<br/>

              Longitude:
              ${longitude.toFixed(4)}°<br/>

              Cycle:
              ${
                profile.cycle ??
                profileId.split("_")[1] ??
                "--"
              }

            `,

          });

        } catch (error) {

          console.error(
            "ARGO marker error:",
            error
          );

        }

      }
    );


    console.log(
      "ARGO markers:",
      argoProfiles.length
    );


  }, [
    activeLayer,
    argoProfiles,
    onArgoSelect,
  ]);


  // =========================================================
  // COPERNICUS OCEAN CURRENTS LAYER + CURRENT ARROW
  // =========================================================

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const layers = viewer.imageryLayers;

    // -------------------------------------------------------
    // REMOVE OLD GLOBAL CURRENT LAYER
    // -------------------------------------------------------

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i);

      if (layer && layer._samudraCurrents) {
        layers.remove(layer, true);
      }
    }

    // -------------------------------------------------------
    // REMOVE OLD CURRENT ARROWS
    // -------------------------------------------------------

    const entities = viewer.entities.values;

    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];

      if (
        entity.properties &&
        entity.properties.isCurrentArrow
      ) {
        viewer.entities.remove(entity);
      }
    }

    // -------------------------------------------------------
    // ONLY SHOW CURRENTS WHEN ACTIVE
    // -------------------------------------------------------

    if (activeLayer !== "currents") {
      return;
    }

    // -------------------------------------------------------
    // COPERNICUS GLOBAL OCEAN CURRENTS
    // -------------------------------------------------------
    // Dataset:
    // cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m
    //
    // sea_water_velocity is the Copernicus derived vector
    // variable containing both eastward and northward velocity.
    // The vectorStyle makes the direction visible on the globe.
    // -------------------------------------------------------

    try {
      const currentUrl =
        "https://wmts.marine.copernicus.eu/teroWmts" +
        "?service=WMTS" +
        "&version=1.0.0" +
        "&request=GetTile" +
        "&layer=GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_202406/sea_water_velocity" +
        "&tilematrixset=EPSG:3857" +
        "&tilematrix={z}" +
        "&tilerow={y}" +
        "&tilecol={x}" +
        "&format=image/png" +
        "&elevation=0" +
        "&STYLE=vectorStyle:solidAndVector,cmap:thermal";

      const provider = new UrlTemplateImageryProvider({
        url: currentUrl,
        minimumLevel: 0,
        maximumLevel: 10,
        tileWidth: 256,
        tileHeight: 256,
        credit: "Copernicus Marine Service Information — Ocean Currents",
      });

      const layer = layers.addImageryProvider(provider);

      layer._samudraCurrents = true;
      layer.alpha = 0.82;

      console.log(
        "SAMUDRA: Copernicus global ocean currents layer enabled"
      );
    } catch (error) {
      console.error(
        "SAMUDRA: Failed to load Copernicus ocean currents layer:",
        error
      );
    }

    // -------------------------------------------------------
    // KEEP THE SELECTED LOCATION CURRENT ARROW
    // -------------------------------------------------------

    if (!currentData) {
      return;
    }

    if (
      currentData.latitude === undefined ||
      currentData.longitude === undefined ||
      currentData.speed === undefined ||
      currentData.direction === undefined
    ) {
      return;
    }

    const latitude = Number(currentData.latitude);
    const longitude = Number(currentData.longitude);
    const speed = Number(currentData.speed);
    const direction = Number(currentData.direction);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(speed) ||
      !Number.isFinite(direction)
    ) {
      return;
    }

    const arrowLength = 0.5;
    const directionRadians = direction * Math.PI / 180;

    const deltaLatitude =
      arrowLength * Math.cos(directionRadians);

    const latitudeRadians = latitude * Math.PI / 180;

    const longitudeScale = Math.cos(latitudeRadians);

    const safeLongitudeScale = Math.max(
      Math.abs(longitudeScale),
      0.01
    );

    const deltaLongitude =
      (arrowLength * Math.sin(directionRadians)) /
      safeLongitudeScale;

    const endLatitude = latitude + deltaLatitude;
    const endLongitude = longitude + deltaLongitude;

    viewer.entities.add({
      id: "samudra-current-arrow",

      polyline: {
        positions: Cartesian3.fromDegreesArray([
          longitude,
          latitude,
          endLongitude,
          endLatitude,
        ]),

        width: 5,

        material: new PolylineArrowMaterialProperty(
          Color.CYAN
        ),

        clampToGround: false,
      },

      properties: {
        isCurrentArrow: true,
      },
    });

    viewer.entities.add({
      id: "samudra-current-point",

      position: Cartesian3.fromDegrees(
        longitude,
        latitude,
        1000
      ),

      point: {
        pixelSize: 8,
        color: Color.CYAN,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },

      properties: {
        isCurrentArrow: true,
      },
    });

    console.log("Current arrow:", {
      latitude,
      longitude,
      speed,
      direction,
    });

    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
        const layer = viewer.imageryLayers.get(i);

        if (layer && layer._samudraCurrents) {
          viewer.imageryLayers.remove(layer, true);
        }
      }

      for (let i = viewer.entities.values.length - 1; i >= 0; i--) {
        const entity = viewer.entities.values[i];

        if (
          entity.properties &&
          entity.properties.isCurrentArrow
        ) {
          viewer.entities.remove(entity);
        }
      }
    };
  }, [
    activeLayer,
    currentData,
  ]);


  // =========================================================
  // RETURN
  // =========================================================

  return (
    <div
      ref={containerRef}
      className="cesium-container"
    />
  );
1

}


export default Globe;