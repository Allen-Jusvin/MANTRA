import xarray as xr
import numpy as np

ds = xr.open_dataset("test-data/temperature-area.nc")

temperature = ds["thetao"].squeeze()

latitudes = ds["latitude"].values
longitudes = ds["longitude"].values
values = temperature.values

valid = np.isfinite(values)

print("Valid cells:", valid.sum())

for lat, lon, temp in zip(
    latitudes[np.where(valid)[0]],
    longitudes[np.where(valid)[1]],
    values[valid]
):
    print(
        f"Latitude: {lat:.4f}, "
        f"Longitude: {lon:.4f}, "
        f"Temperature: {temp:.2f} °C"
    )