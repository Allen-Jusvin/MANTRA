import { useEffect, useState } from "react";

import {
  MapPin,
  Activity,
  Thermometer,
  Droplets,
  Calendar,
  Navigation,
  ArrowLeft,
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

import "./ArgoPage.css";

function ArgoPage({ onBack }) {

  // =====================================================
  // STATE
  // =====================================================

  const [profiles, setProfiles] =
    useState([]);

  const [selectedFloat, setSelectedFloat] =
    useState(null);

  const [profileData, setProfileData] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [profileLoading, setProfileLoading] =
    useState(false);

  const [error, setError] =
    useState(null);


  // =====================================================
  // LOAD ARGO FLOATS
  // =====================================================

  useEffect(() => {

    const loadArgoFloats =
      async () => {

        try {

          setLoading(true);
          setError(null);

          const response =
            await fetch(
              "http://127.0.0.1:8000/argo-test"
            );

          if (!response.ok) {

            throw new Error(
              "Failed to load ARGO data"
            );

          }

          const data =
            await response.json();

          console.log(
            "ARGO DATA:",
            data
          );

          setProfiles(
            data.profiles || []
          );

        } catch (error) {

          console.error(
            "ARGO error:",
            error
          );

          setError(
            "Unable to load ARGO data."
          );

        } finally {

          setLoading(false);

        }

      };

    loadArgoFloats();

  }, []);


  // =====================================================
  // SELECT FLOAT
  // =====================================================

  const handleFloatSelect =
    async (float) => {

      setSelectedFloat(float);

      setProfileData(null);

      setProfileLoading(true);

      setError(null);

      try {

        const profileId =
          float._id;

        const parts =
          profileId.split("_");

        const floatId =
          parts[0];

        const cycle =
          parts[1];

        const response =
          await fetch(
            `http://127.0.0.1:8000/argo-profile-data/${floatId}/${cycle}`
          );

        if (!response.ok) {

          throw new Error(
            "Failed to load ARGO profile"
          );

        }

        const data =
          await response.json();

        console.log(
          "ARGO PROFILE:",
          data
        );

        if (data.error) {

          throw new Error(
            data.error
          );

        }

        setProfileData(data);

      } catch (error) {

        console.error(
          "ARGO profile error:",
          error
        );

        setError(
          "Unable to load ARGO profile."
        );

      } finally {

        setProfileLoading(false);

      }

    };


  // =====================================================
  // CHART DATA
  // =====================================================

  const chartData =
    profileData?.profile?.map(
      (item) => ({
        pressure:
          item.pressure,

        temperature:
          item.temperature,

        salinity:
          item.salinity,
      })
    ) || [];


  // =====================================================
  // PAGE
  // =====================================================

  return (

    <div className="argo-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="argo-header">

        <div className="argo-title">

          <button
            className="argo-back-button"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
          </button>


          <div className="argo-title-icon">

            <Activity size={24} />

          </div>


          <div>

            <h1>
              ARGO FLOATS
            </h1>

            <span>
              Ocean Observation Intelligence
            </span>

          </div>

        </div>


        <div className="argo-status">

          <span className="argo-status-dot" />

          ARGO DATA ONLINE

        </div>

      </header>


      {/* =================================================
          MAIN
      ================================================= */}

      <main className="argo-main">


        {/* =================================================
            FLOAT LIST
        ================================================= */}

        <section className="argo-floats-panel">

          <div className="section-heading">

            <div>

              <span>
                OBSERVATIONS
              </span>

              <h2>
                ARGO Floats
              </h2>

            </div>


            <strong>
              {profiles.length}
            </strong>

          </div>


          {loading && (

            <div className="argo-message">

              Loading ARGO observations...

            </div>

          )}


          {error && (

            <div className="argo-error">

              {error}

            </div>

          )}


          {!loading &&
            !error &&
            profiles.length === 0 && (

              <div className="argo-message">

                No ARGO observations found.

              </div>

            )}


          <div className="argo-float-list">

            {profiles.map(
              (float) => {

                const coordinates =
                  float.geolocation
                    ?.coordinates ||
                  [];

                const longitude =
                  coordinates[0];

                const latitude =
                  coordinates[1];

                const isSelected =
                  selectedFloat?._id ===
                  float._id;

                return (

                  <button
                    key={float._id}
                    className={
                      isSelected
                        ? "argo-float-card selected"
                        : "argo-float-card"
                    }
                    onClick={() =>
                      handleFloatSelect(
                        float
                      )
                    }
                  >

                    <div className="float-icon">

                      <MapPin
                        size={19}
                      />

                    </div>


                    <div className="float-info">

                      <strong>

                        Float{" "}
                        {float._id.split(
                          "_"
                        )[0]}

                      </strong>


                      <span>

                        Cycle{" "}
                        {float.cycle_number}

                      </span>


                      <small>

                        {latitude?.toFixed(
                          4
                        )}
                        ° N

                        {"  "}

                        {longitude?.toFixed(
                          4
                        )}
                        ° E

                      </small>

                    </div>


                    <Navigation
                      size={16}
                    />

                  </button>

                );

              }
            )}

          </div>

        </section>


        {/* =================================================
            DETAILS
        ================================================= */}

        <section className="argo-detail-panel">


          {!selectedFloat && (

            <div className="argo-empty">

              <Activity
                size={45}
              />

              <h2>
                Select an ARGO float
              </h2>

              <p>

                Select a float from
                the observation list
                to view its profile
                data.

              </p>

            </div>

          )}


          {selectedFloat && (

            <>

              {/* FLOAT HEADER */}

              <div className="float-header">

                <div>

                  <span>
                    SELECTED FLOAT
                  </span>

                  <h2>

                    Float{" "}
                    {selectedFloat._id.split(
                      "_"
                    )[0]}

                  </h2>

                </div>


                <div className="cycle-badge">

                  Cycle{" "}
                  {selectedFloat.cycle_number}

                </div>

              </div>


              {/* INFO */}

              <div className="argo-info-grid">


                <div className="argo-info-card">

                  <MapPin
                    size={18}
                  />

                  <span>
                    LOCATION
                  </span>

                  <strong>

                    {selectedFloat
                      .geolocation
                      ?.coordinates?.[1]
                      ?.toFixed(4)}
                    ° N

                  </strong>

                  <small>

                    {selectedFloat
                      .geolocation
                      ?.coordinates?.[0]
                      ?.toFixed(4)}
                    ° E

                  </small>

                </div>


                <div className="argo-info-card">

                  <Calendar
                    size={18}
                  />

                  <span>
                    OBSERVATION
                  </span>

                  <strong>

                    {new Date(
                      selectedFloat.timestamp
                    ).toLocaleDateString()}

                  </strong>

                  <small>

                    {new Date(
                      selectedFloat.timestamp
                    ).toLocaleTimeString()}

                  </small>

                </div>


                <div className="argo-info-card">

                  <Navigation
                    size={18}
                  />

                  <span>
                    DIRECTION
                  </span>

                  <strong>

                    {selectedFloat
                      .profile_direction ||
                      "--"}

                  </strong>

                  <small>
                    Profile direction
                  </small>

                </div>

              </div>


              {/* PROFILE LOADING */}

              {profileLoading && (

                <div className="argo-loading">

                  Loading ARGO profile...

                </div>

              )}


              {/* PROFILE */}

              {profileData &&
                !profileLoading && (

                  <>

                    {/* =================================
                        TEMPERATURE
                    ================================= */}

                    <div className="argo-chart-card">

                      <div className="chart-heading">

                        <div>

                          <Thermometer
                            size={19}
                          />

                          <div>

                            <strong>
                              Temperature Profile
                            </strong>

                            <span>
                              Temperature vs Pressure
                            </span>

                          </div>

                        </div>


                        <strong>

                          {chartData.length}
                          {" "}
                          points

                        </strong>

                      </div>


                      <ResponsiveContainer
                        width="100%"
                        height={300}
                      >

                        <LineChart
                          data={chartData}
                          margin={{
                            top: 10,
                            right: 20,
                            left: 10,
                            bottom: 10,
                          }}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                          />


                          <XAxis
                            dataKey="pressure"
                            tickFormatter={(
                              value
                            ) =>
                              Number(
                                value
                              ).toFixed(0)
                            }
                            label={{
                              value:
                                "Pressure (dbar)",
                              position:
                                "insideBottom",
                              offset: -5,
                            }}
                          />


                          <YAxis
                            tickFormatter={(
                              value
                            ) =>
                              Number(
                                value
                              ).toFixed(1)
                            }
                            label={{
                              value:
                                "Temperature (°C)",
                              angle: -90,
                              position:
                                "insideLeft",
                            }}
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
                              `Pressure: ${Number(
                                value
                              ).toFixed(
                                1
                              )} dbar`
                            }

                          />


                          <Line
                            type="monotone"
                            dataKey="temperature"
                            strokeWidth={2}
                            dot={false}
                          />

                        </LineChart>

                      </ResponsiveContainer>

                    </div>


                    {/* =================================
                        SALINITY
                    ================================= */}

                    <div className="argo-chart-card">

                      <div className="chart-heading">

                        <div>

                          <Droplets
                            size={19}
                          />

                          <div>

                            <strong>
                              Salinity Profile
                            </strong>

                            <span>
                              Salinity vs Pressure
                            </span>

                          </div>

                        </div>

                      </div>


                      <ResponsiveContainer
                        width="100%"
                        height={300}
                      >

                        <LineChart
                          data={chartData}
                          margin={{
                            top: 10,
                            right: 20,
                            left: 10,
                            bottom: 10,
                          }}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                          />


                          <XAxis
                            dataKey="pressure"
                            tickFormatter={(
                              value
                            ) =>
                              Number(
                                value
                              ).toFixed(0)
                            }
                            label={{
                              value:
                                "Pressure (dbar)",
                              position:
                                "insideBottom",
                              offset: -5,
                            }}
                          />


                          <YAxis
                            tickFormatter={(
                              value
                            ) =>
                              Number(
                                value
                              ).toFixed(2)
                            }
                            label={{
                              value:
                                "Salinity (PSU)",
                              angle: -90,
                              position:
                                "insideLeft",
                            }}
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

                            labelFormatter={(
                              value
                            ) =>
                              `Pressure: ${Number(
                                value
                              ).toFixed(
                                1
                              )} dbar`
                            }

                          />


                          <Line
                            type="monotone"
                            dataKey="salinity"
                            strokeWidth={2}
                            dot={false}
                          />

                        </LineChart>

                      </ResponsiveContainer>

                    </div>

                  </>

                )}

            </>

          )}

        </section>

      </main>

    </div>

  );
}

export default ArgoPage;