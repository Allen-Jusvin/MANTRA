import { useCallback, useEffect, useState } from "react";

import {
  Waves,
  Thermometer,
  Droplets,
  Leaf,
  Fish,
  Navigation,
  Map,
  Settings,
  Search,
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import Globe from "./components/Globe";
import "./App.css";


function App() {

  // =========================================================
  // BASIC STATE
  // =========================================================

  const [activeLayer, setActiveLayer] =
    useState("temperature");

  const [selectedLocation, setSelectedLocation] =
    useState(null);

  const [oceanData, setOceanData] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [depthProfile, setDepthProfile] =
    useState([]);

  const [selectedDepth, setSelectedDepth] =
    useState(0);

  // Actual seafloor depth at the clicked latitude/longitude.
  // This is separate from the temperature-vs-depth profile below.
  const [seafloorDepth, setSeafloorDepth] =
    useState(null);


  // =========================================================
  // BATHYMETRY STATE
  // =========================================================

  const [bathymetryEnabled, setBathymetryEnabled] =
    useState(false);

  const [eezEnabled, setEezEnabled] = useState(false);

  // =========================================================
  // PFZ STATE
  // =========================================================

  const [pfzData, setPfzData] = useState(null);
  const [pfzLoading, setPfzLoading] = useState(false);
  const [pfzError, setPfzError] = useState(null);

  // =========================================================
  // ARGO STATE
  // =========================================================

  const [argoProfiles, setArgoProfiles] =
    useState([]);

  const [selectedArgo, setSelectedArgo] =
    useState(null);

  const [argoProfileData, setArgoProfileData] =
    useState(null);

  const [argoProfileLoading, setArgoProfileLoading] =
    useState(false);

  const [argoProfileError, setArgoProfileError] =
    useState(null);


  // =========================================================
  // FETCH INCOIS PFZ DATA
  // =========================================================

  useEffect(() => {

    if (activeLayer !== "fishing") {
      return;
    }

    const fetchPFZ = async () => {

      setPfzLoading(true);
      setPfzError(null);

      try {

        const response = await fetch(
          "http://127.0.0.1:8000/pfz-data"
        );

        if (!response.ok) {
          throw new Error("Failed to fetch INCOIS PFZ data");
        }

        const data = await response.json();

        console.log("INCOIS PFZ:", data);
        setPfzData(data);

      } catch (error) {

        console.error("PFZ error:", error);
        setPfzError(error.message || "Unable to load PFZ data");

      } finally {
        setPfzLoading(false);
      }

    };

    fetchPFZ();

  }, [activeLayer]);


  // =========================================================
  // FETCH ARGO FLOATS
  // =========================================================

  useEffect(() => {

    const fetchArgoProfiles = async () => {

      try {

        const response = await fetch(
          "http://127.0.0.1:8000/argo-test"
        );

        if (!response.ok) {
          throw new Error(
            "Failed to fetch ARGO floats"
          );
        }

        const data =
          await response.json();

        console.log(
          "ARGO profiles:",
          data
        );

        setArgoProfiles(
          data.profiles || []
        );

      } catch (error) {

        console.error(
          "Failed to fetch ARGO profiles:",
          error
        );

      }

    };

    fetchArgoProfiles();

  }, []);


  // =========================================================
  // OCEAN LOCATION SELECT
  // =========================================================

  const handleLocationSelect =
    useCallback(
      async (location) => {

        setSelectedLocation(
          location
        );

        setSelectedDepth(0);

        setSeafloorDepth(null);

        setDepthProfile([]);

        setOceanData(null);

        setError(null);

        setLoading(true);

        try {

          // ---------------------------------------------------
          // OCEAN DATA
          // ---------------------------------------------------

          const response =
            await fetch(
              `http://127.0.0.1:8000/ocean?latitude=${location.latitude}&longitude=${location.longitude}`
            );

          if (!response.ok) {

            throw new Error(
              "Failed to fetch ocean data"
            );

          }

          const data =
            await response.json();

          console.log(
            "Ocean data:",
            data
          );

          setOceanData(data);

          setSeafloorDepth(
            data?.bathymetry_data?.depth_m ?? null
          );


          // ---------------------------------------------------
          // LIVE TEMPERATURE-DEPTH PROFILE
          // Uses the same Copernicus profile as the displayed temperature.
          // ---------------------------------------------------

          setDepthProfile(
            data?.temperature_profile_data?.profile || []
          );

        } catch (error) {

          console.error(
            "Failed to fetch ocean data:",
            error
          );

          setError(
            "Unable to fetch ocean data."
          );

        } finally {

          setLoading(false);

        }

      },
      []
    );


  // =========================================================
  // ARGO FLOAT SELECT
  // =========================================================

  const handleArgoSelect =
    useCallback(
      async (profile) => {

        console.log(
          "Selected ARGO:",
          profile
        );

        setSelectedArgo(
          profile
        );

        setArgoProfileData(
          null
        );

        setArgoProfileError(
          null
        );

        setArgoProfileLoading(
          true
        );

        try {

          // ---------------------------------------------------
          // PROFILE ID
          // ---------------------------------------------------

          const profileId =
            profile?._id ||
            profile?.id;

          if (!profileId) {

            throw new Error(
              "ARGO profile ID is missing"
            );

          }


          const parts =
            profileId.split("_");


          const floatId =
            parts[0];

          const cycle =
            parts[1];


          if (
            !floatId ||
            !cycle
          ) {

            throw new Error(
              "Invalid ARGO profile ID"
            );

          }


          // ---------------------------------------------------
          // FETCH ARGO PROFILE
          // ---------------------------------------------------

          const response =
            await fetch(
              `http://127.0.0.1:8000/argo-profile-data/${floatId}/${cycle}`
            );


          if (!response.ok) {

            throw new Error(
              "Failed to fetch ARGO profile data"
            );

          }


          const data =
            await response.json();


          console.log(
            "ARGO profile data:",
            data
          );


          if (data.error) {

            throw new Error(
              data.error
            );

          }


          setArgoProfileData(
            data
          );

        } catch (error) {

          console.error(
            "ARGO profile error:",
            error
          );

          setArgoProfileError(
            error.message ||
            "Unable to load ARGO profile"
          );

        } finally {

          setArgoProfileLoading(
            false
          );

        }

      },
      []
    );


  // =========================================================
  // LAYERS
  // =========================================================

  const layers = [

    {
      id: "temperature",
      name: "Temperature",
      icon: Thermometer,
    },

    {
      id: "salinity",
      name: "Salinity",
      icon: Droplets,
    },

    {
      id: "chlorophyll",
      name: "Chlorophyll",
      icon: Leaf,
    },

    {
      id: "currents",
      name: "Ocean Currents",
      icon: Navigation,
    },

    {
      id: "swell",
      name: "Ocean Swell",
      icon: Waves,
    },

    {
      id: "fishing",
      name: "Fishing Zones",
      icon: Fish,
    },

    {
      id: "argo",
      name: "ARGO Floats",
      icon: Navigation,
    },

  ];


  // =========================================================
  // OCEAN VALUES
  // =========================================================

  const temperature =
    oceanData
      ?.temperature_data
      ?.temperature;

  const temperatureTimestamp =
    oceanData
      ?.temperature_data
      ?.timestamp;

  const temperatureSource =
    oceanData
      ?.temperature_data
      ?.source;


  const salinity =
    oceanData
      ?.salinity_data
      ?.salinity;


  const chlorophyll =
    oceanData
      ?.chlorophyll_data
      ?.chlorophyll;


  const waveHeight =
    oceanData
      ?.wave_data
      ?.wave_height;


  // =========================================================
  // ARGO PROFILE
  // =========================================================

  const argoProfile =
    argoProfileData?.profile || [];


  // =========================================================
  // RETURN
  // =========================================================

  return (

    <div className="app">


      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="header">

        <div className="logo">

          <div className="logo-icon">

            <Waves size={25} />

          </div>

          <div>

            <h1>MANTRA</h1>

            <span>
              Ocean Intelligence
            </span>

          </div>

        </div>


        <div className="search-box">

          <Search size={18} />

          <input
            type="text"
            placeholder="Search ocean location..."
          />

        </div>


        <button className="settings">

          <Settings size={20} />

        </button>

      </header>


      {/* =====================================================
          MAIN
      ====================================================== */}

      <main className="main">


        {/* ===================================================
            LEFT SIDEBAR
        ==================================================== */}

        <aside className="sidebar">


          <div className="sidebar-title">

            <Map size={18} />
          

            <span>
              OCEAN LAYERS
            </span>

          </div>


          <div className="layers">

            {layers.map(
              (layer) => {

                const Icon =
                  layer.icon;

                return (

                  <button
                    key={layer.id}
                    className={
                      activeLayer ===
                      layer.id
                        ? "layer active"
                        : "layer"
                    }
                    onClick={() =>
                      setActiveLayer(
                        layer.id
                      )
                    }
                  >

                    <Icon size={19} />

                    <span>
                      {layer.name}
                    </span>

                    <div
                      className="layer-status"
                    />

                  </button>

                );

              }
            )}

          </div>


          {/* =================================================
              MAP FEATURES
          ================================================== */}

          <div className="sidebar-section">

            <div className="section-title">
              MAP
            </div>

            <div className="layers">

              {/* BATHYMETRY */}

              <button
                className={
                  bathymetryEnabled
                    ? "layer active"
                    : "layer"
                }
                onClick={() =>
                  setBathymetryEnabled(
                    !bathymetryEnabled
                  )
                }
              >

                <Waves size={19} />

                <span>
                  Bathymetry
                </span>

                <div className="layer-status" />

              </button>


              {/* EEZ BOUNDARIES */}

              <button
                className={
                  eezEnabled
                    ? "layer active"
                    : "layer"
                }
                onClick={() =>
                  setEezEnabled(
                    !eezEnabled
                  )
                }
              >

                <Map size={19} />

                <span>
                  EEZ Boundaries
                </span>

                <div className="layer-status" />

              </button>


              {/* FISHING ZONES / PFZ */}

              <button
                className={
                  activeLayer === "fishing"
                    ? "layer active"
                    : "layer"
                }
                onClick={() => {

                  if (activeLayer === "fishing") {

                    setActiveLayer("temperature");

                  } else {

                    setActiveLayer("fishing");

                  }

                }}
              >

                <Fish size={19} />

                <span>
                  Fishing Zones (PFZ)
                </span>

                <div className="layer-status" />

              </button>

            </div>

          </div>


          {/* =================================================
              ARGO STATUS
          ================================================== */}

          {activeLayer ===
            "argo" && (

            <div className="sidebar-section">

              <div className="section-title">
                ARGO
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "#8ca6b8",
                  lineHeight: "1.5",
                }}
              >

                Floats loaded:{" "}

                <strong
                  style={{
                    color: "#4dd9ff",
                  }}
                >
                  {argoProfiles.length}
                </strong>

              </div>

            </div>

          )}


          {/* =================================================
              SYSTEM STATUS
          ================================================== */}

          <div className="system-status">

            <div className="status-dot" />

            <div>

              <strong>
                System Online
              </strong>

              <span>
                Ocean data available
              </span>

            </div>

          </div>

        </aside>


        {/* ===================================================
            GLOBE
        ==================================================== */}

        <section className="globe-area">

          <div className="globe-container">

            <Globe
              onLocationSelect={
                handleLocationSelect
              }

              activeLayer={
                activeLayer
              }

              argoProfiles={
                argoProfiles
              }

              onArgoSelect={
                handleArgoSelect
              }

              currentData={
                oceanData?.current_data
              }

              bathymetryEnabled={
                bathymetryEnabled
              }

              eezEnabled={
                eezEnabled
              }

              pfzEnabled={
                activeLayer === "fishing"
              }
            />

          </div>


          {/* COORDINATES */}

          <div className="coordinates">

            <span>
              LAT
            </span>

            <strong>

              {selectedLocation

                ? selectedLocation
                    .latitude
                    .toFixed(4)

                : "--"}

            </strong>


            <span>
              LON
            </span>

            <strong>

              {selectedLocation

                ? selectedLocation
                    .longitude
                    .toFixed(4)

                : "--"}

            </strong>

          </div>


        </section>


        {/* ===================================================
            RIGHT PANEL
        ==================================================== */}

        <aside className="data-panel">


          {/* =================================================
              ARGO PANEL
          ================================================== */}

          {activeLayer ===
            "argo" ? (

            <>


              <div className="panel-header">

                <div>

                  <span className="panel-label">
                    ARGO OBSERVATION
                  </span>

                  <h2>
                    Float Profile
                  </h2>

                </div>


                <div className="live-indicator">

                  <div />

                  ARGO

                </div>

              </div>


              {selectedArgo ? (

                <>


                  {/* FLOAT INFORMATION */}

                  <div className="location-card">


                    <div className="coordinate">

                      <span>
                        FLOAT ID
                      </span>

                      <strong
                        style={{
                          fontSize:
                            "14px",
                        }}
                      >

                        {selectedArgo._id ||
                          selectedArgo.id ||
                          "--"}

                      </strong>

                    </div>


                    <div className="coordinate">

                      <span>
                        CYCLE
                      </span>

                      <strong>

                        {selectedArgo.cycle ??
                          selectedArgo._id
                            ?.split("_")[1] ??
                          "--"}

                      </strong>

                    </div>


                    <div className="coordinate">

                      <span>
                        LATITUDE
                      </span>

                      <strong>

                        {selectedArgo
                          ?.geolocation
                          ?.coordinates

                          ? `${Number(
                              selectedArgo
                                .geolocation
                                .coordinates[1]
                            ).toFixed(4)}°`

                          : "--"}

                      </strong>

                    </div>


                    <div className="coordinate">

                      <span>
                        LONGITUDE
                      </span>

                      <strong>

                        {selectedArgo
                          ?.geolocation
                          ?.coordinates

                          ? `${Number(
                              selectedArgo
                                .geolocation
                                .coordinates[0]
                            ).toFixed(4)}°`

                          : "--"}

                      </strong>

                    </div>

                  </div>


                  {/* TIME */}

                  <div
                    style={{
                      marginTop: "12px",
                      marginBottom: "12px",
                      fontSize: "12px",
                      color: "#8ca6b8",
                    }}
                  >

                    Observation:

                    <strong
                      style={{
                        display:
                          "block",
                        color:
                          "#d7edf7",
                        marginTop:
                          "4px",
                      }}
                    >

                      {selectedArgo.timestamp ||
                        selectedArgo.date ||
                        "--"}

                    </strong>

                  </div>


                  {/* LOADING */}

                  {argoProfileLoading && (

                    <div className="loading-message">

                      Loading ARGO profile...

                    </div>

                  )}


                  {/* ERROR */}

                  {argoProfileError &&
                    !argoProfileLoading && (

                    <div className="error-message">

                      {argoProfileError}

                    </div>

                  )}


                  {/* PROFILE */}

                  {!argoProfileLoading &&
                    !argoProfileError &&
                    argoProfile.length >
                      0 && (

                    <>


                      {/* PROFILE SUMMARY */}

                      <div className="data-grid">


                        <div className="data-card">

                          <Thermometer
                            size={20}
                          />

                          <span>
                            Measurements
                          </span>

                          <strong>

                            {argoProfile.length}

                          </strong>

                        </div>


                        <div className="data-card">

                          <Navigation
                            size={20}
                          />

                          <span>
                            Max Pressure
                          </span>

                          <strong>

                            {Math.max(
                              ...argoProfile.map(
                                (item) =>
                                  Number(
                                    item.pressure
                                  )
                              )
                            ).toFixed(0)}{" "}
                            dbar

                          </strong>

                        </div>

                      </div>


                      {/* TEMPERATURE GRAPH */}

                      <div className="depth-chart">

                        <div
                          className="depth-chart-header"
                        >

                          <span>
                            ARGO TEMPERATURE
                          </span>

                          <small>
                            Temperature vs Pressure
                          </small>

                        </div>


                        <ResponsiveContainer
                          width="100%"
                          height={230}
                        >

                          <LineChart
                            data={
                              argoProfile
                            }
                            margin={{
                              top: 10,
                              right: 10,
                              left: 0,
                              bottom: 10,
                            }}
                          >

                            <CartesianGrid
                              strokeDasharray="3 3"
                            />


                            <XAxis
                              dataKey="temperature"
                              type="number"
                              tickFormatter={(
                                value
                              ) =>
                                `${Number(
                                  value
                                ).toFixed(
                                  1
                                )}°`
                              }
                            />


                            <YAxis
                              dataKey="pressure"
                              type="number"
                              reversed
                              tickFormatter={(
                                value
                              ) =>
                                `${Number(
                                  value
                                ).toFixed(
                                  0
                                )}`
                              }
                            />


                            <Tooltip
                              formatter={(
                                value
                              ) => [

                                `${Number(
                                  value
                                ).toFixed(
                                  2
                                )} °C`,

                                "Temperature",

                              ]}
                            />


                            <Line
                              type="monotone"
                              dataKey="temperature"
                              strokeWidth={2}
                              dot={{
                                r: 2,
                              }}
                              activeDot={{
                                r: 4,
                              }}
                            />

                          </LineChart>

                        </ResponsiveContainer>

                      </div>


                      {/* SALINITY GRAPH */}

                      <div className="depth-chart">

                        <div
                          className="depth-chart-header"
                        >

                          <span>
                            ARGO SALINITY
                          </span>

                          <small>
                            Salinity vs Pressure
                          </small>

                        </div>


                        <ResponsiveContainer
                          width="100%"
                          height={230}
                        >

                          <LineChart
                            data={
                              argoProfile
                            }
                            margin={{
                              top: 10,
                              right: 10,
                              left: 0,
                              bottom: 10,
                            }}
                          >

                            <CartesianGrid
                              strokeDasharray="3 3"
                            />


                            <XAxis
                              dataKey="salinity"
                              type="number"
                              tickFormatter={(
                                value
                              ) =>
                                Number(
                                  value
                                ).toFixed(
                                  1
                                )
                              }
                            />


                            <YAxis
                              dataKey="pressure"
                              type="number"
                              reversed
                              tickFormatter={(
                                value
                              ) =>
                                `${Number(
                                  value
                                ).toFixed(
                                  0
                                )}`
                              }
                            />


                            <Tooltip
                              formatter={(
                                value
                              ) => [

                                `${Number(
                                  value
                                ).toFixed(
                                  3
                                )} PSU`,

                                "Salinity",

                              ]}
                            />


                            <Line
                              type="monotone"
                              dataKey="salinity"
                              strokeWidth={2}
                              dot={{
                                r: 2,
                              }}
                              activeDot={{
                                r: 4,
                              }}
                            />

                          </LineChart>

                        </ResponsiveContainer>

                      </div>


                      {/* SOURCE */}

                      <div className="source">

                        <span>
                          DATA SOURCE
                        </span>

                        <strong>

                          {argoProfileData
                            ?.source ||
                            "Argo / Argovis"}

                        </strong>


                        {argoProfileData
                          ?.timestamp && (

                          <small>

                            Time:{" "}
                            {
                              argoProfileData
                                .timestamp
                            }

                          </small>

                        )}

                      </div>

                    </>

                  )}


                  {/* NO PROFILE */}

                  {!argoProfileLoading &&
                    !argoProfileError &&
                    argoProfile.length ===
                      0 && (

                    <div className="loading-message">

                      No profile measurements
                      available.

                    </div>

                  )}

                </>

              ) : (

                <div
                  className="loading-message"
                  style={{
                    marginTop:
                      "20px",
                  }}
                >

                  Click a cyan ARGO float
                  on the globe to view
                  its profile.

                </div>

              )}

            </>

          ) : activeLayer === "fishing" ? (

            <>

              <div className="panel-header">

                <div>
                  <span className="panel-label">
                    INCOIS ADVISORY
                  </span>

                  <h2>Potential Fishing Zone</h2>
                </div>

                <div className="live-indicator">
                  <div />
                  PFZ
                </div>

              </div>

              {pfzLoading && (
                <div className="loading-message">
                  Loading latest INCOIS PFZ advisory...
                </div>
              )}

              {pfzError && !pfzLoading && (
                <div className="error-message">
                  {pfzError}
                </div>
              )}

              {!pfzLoading && !pfzError && pfzData && (
                <>

                  <div className="data-grid">

                    <div className="data-card">
                      <Fish size={20} />
                      <span>Source</span>
                      <strong>INCOIS</strong>
                    </div>

                    <div className="data-card">
                      <Navigation size={20} />
                      <span>Service</span>
                      <strong>PFZ Advisory</strong>
                    </div>

                  </div>

                  <div className="location-card" style={{ marginTop: "12px" }}>

                    <div className="coordinate">
                      <span>FORECAST DATE</span>
                      <strong>{pfzData.forecast_date || "--"}</strong>
                    </div>

                    <div className="coordinate">
                      <span>VALID UPTO</span>
                      <strong>{pfzData.valid_upto || "--"}</strong>
                    </div>

                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px",
                      borderRadius: "10px",
                      background: "rgba(77,217,255,0.06)",
                      border: "1px solid rgba(77,217,255,0.12)",
                      color: "#8ca6b8",
                      fontSize: "12px",
                      lineHeight: "1.6",
                    }}
                  >
                    {pfzData.note}
                  </div>

                  <a
                    href={pfzData.webgis_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      marginTop: "12px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(77,217,255,0.10)",
                      color: "#4dd9ff",
                      textDecoration: "none",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Open Official INCOIS PFZ WebGIS ↗
                  </a>

                </>
              )}

            </>

          ) : (


            /* =================================================
               NORMAL OCEAN PANEL
            ================================================== */

            <>


              <div className="panel-header">

                <div>

                  <span className="panel-label">
                    SELECTED LOCATION
                  </span>

                  <h2>
                    Ocean Data
                  </h2>

                </div>


                <div className="live-indicator">

                  <div />

                  LATEST

                </div>

              </div>


              {/* LOCATION */}

              <div className="location-card">

                <div className="coordinate">

                  <span>
                    LATITUDE
                  </span>

                  <strong>

                    {selectedLocation

                      ? `${selectedLocation.latitude.toFixed(
                          4
                        )}°`

                      : "--"}

                  </strong>

                </div>


                <div className="coordinate">

                  <span>
                    LONGITUDE
                  </span>

                  <strong>

                    {selectedLocation

                      ? `${selectedLocation.longitude.toFixed(
                          4
                        )}°`

                      : "--"}

                  </strong>

                </div>

              </div>


              {/* LOADING */}

              {loading && (

                <div className="loading-message">

                  Loading ocean data...

                </div>

              )}


              {/* ERROR */}

              {error &&
                !loading && (

                <div className="error-message">

                  {error}

                </div>

              )}


              {/* DATA */}

              {!loading &&
                !error && (

                <div className="data-grid">


                  {/* TEMPERATURE */}

                  <div className="data-card">

                    <Thermometer
                      size={20}
                    />

                    <span>
                      Temperature
                    </span>

                    <strong>

                      {temperature !==
                        undefined &&
                        temperature !== null

                        ? `${temperature.toFixed(
                            2
                          )} °C`

                        : "-- °C"}

                    </strong>

                  </div>


                  {/* SALINITY */}

                  <div className="data-card">

                    <Droplets
                      size={20}
                    />

                    <span>
                      Salinity
                    </span>

                    <strong>

                      {salinity !==
                        undefined &&
                        salinity !== null

                        ? `${salinity.toFixed(
                            2
                          )} PSU`

                        : "-- PSU"}

                    </strong>

                  </div>


                  {/* CHLOROPHYLL */}

                  <div className="data-card">

                    <Leaf size={20} />

                    <span>
                      Chlorophyll
                    </span>

                    <strong>

                      {chlorophyll !==
                        undefined &&
                        chlorophyll !== null

                        ? `${chlorophyll.toFixed(
                            3
                          )} mg/m³`

                        : "-- mg/m³"}

                    </strong>

                  </div>


                  {/* WAVE */}

                  <div className="data-card">

                    <Waves size={20} />

                    <span>
                      Wave Height
                    </span>

                    <strong>

                      {waveHeight !==
                        undefined &&
                        waveHeight !== null

                        ? `${waveHeight.toFixed(
                            2
                          )} m`

                        : "-- m"}

                    </strong>

                  </div>

                </div>

              )}


              {/* =================================================
                  DEPTH
              ================================================== */}

              <div className="depth-section">

                <div className="depth-header">

                  <div>

                    <span>
                      DEPTH
                    </span>

                    <strong>

                      {seafloorDepth !== null &&
                      seafloorDepth !== undefined

                        ? `${Number(
                            seafloorDepth
                          ).toFixed(2)} m`

                        : "--"}

                    </strong>

                  </div>


                  <span>

                    {oceanData?.bathymetry_data?.source ||
                      "GEBCO"}

                  </span>

                </div>


                {depthProfile.length >
                  0 && (

                  <div className="depth-value">

                    <strong>

                      {depthProfile[
                        selectedDepth
                      ]?.depth.toFixed(
                        2
                      )} m

                    </strong>

                    <span>

                      {depthProfile[
                        selectedDepth
                      ]?.temperature.toFixed(
                        2
                      )} °C

                    </span>

                  </div>

                )}


                <input
                  type="range"
                  min="0"
                  max={Math.max(
                    depthProfile.length -
                      1,
                    0
                  )}
                  value={
                    selectedDepth
                  }
                  onChange={(event) =>
                    setSelectedDepth(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  disabled={
                    depthProfile.length ===
                    0
                  }
                />

              </div>


              {/* DEPTH GRAPH */}

              {depthProfile.length >
                0 && (

                <div className="depth-chart">

                  <div
                    className="depth-chart-header"
                  >

                    <span>
                      TEMPERATURE PROFILE
                    </span>

                    <small>
                      Depth vs Temperature
                    </small>

                  </div>


                  <ResponsiveContainer
                    width="100%"
                    height={220}
                  >

                    <LineChart
                      data={
                        depthProfile
                      }
                      margin={{
                        top: 10,
                        right: 10,
                        left: 0,
                        bottom: 10,
                      }}
                    >

                      <CartesianGrid
                        strokeDasharray="3 3"
                      />


                      <XAxis
                        dataKey="depth"
                        tickFormatter={(
                          value
                        ) =>
                          `${Number(
                            value
                          ).toFixed(
                            0
                          )}m`
                        }
                      />


                      <YAxis
                        domain={[
                          "auto",
                          "auto",
                        ]}
                        tickFormatter={(
                          value
                        ) =>
                          `${Number(
                            value
                          ).toFixed(
                            1
                          )}°`
                        }
                      />


                      <Tooltip
                        formatter={(
                          value
                        ) => [

                          `${Number(
                            value
                          ).toFixed(
                            2
                          )} °C`,

                          "Temperature",

                        ]}
                        labelFormatter={(
                          value
                        ) =>
                          `Depth: ${Number(
                            value
                          ).toFixed(
                            2
                          )} m`
                        }
                      />


                      <Line
                        type="monotone"
                        dataKey="temperature"
                        strokeWidth={2}
                        dot={{
                          r: 3,
                        }}
                        activeDot={{
                          r: 5,
                        }}
                      />

                    </LineChart>

                  </ResponsiveContainer>

                </div>

              )}


              {/* SOURCE */}

              <div className="source">

                <span>
                  DATA SOURCE
                </span>

                <strong>

                  {temperatureSource ||
                    "SAMUDRA Ocean Data Engine"}

                </strong>


                {temperatureTimestamp && (

                  <small>

                    Data date:{" "}
                    {temperatureTimestamp}

                  </small>

                )}

              </div>

            </>

          )}

        </aside>

      </main>

    </div>

  );
}


export default App;