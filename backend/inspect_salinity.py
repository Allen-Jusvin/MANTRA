import xarray as xr
import numpy as np

file_path = "test-data/salinity-area.nc"

ds = xr.open_dataset(file_path)

print(ds)

salinity = ds["so"].squeeze()

print("\nShape:", salinity.shape)

values = salinity.values

valid = values[np.isfinite(values)]

print("Valid values:", len(valid))
print("NaN values:", np.isnan(values).sum())

if len(valid) > 0:
    print("Minimum salinity:", valid.min())
    print("Maximum salinity:", valid.max())

    latitudes = ds["latitude"].values
    longitudes = ds["longitude"].values

    print("\nSome valid values:")

    valid_indices = np.argwhere(np.isfinite(values))

    for index in valid_indices[:20]:
        lat_index = index[0]
        lon_index = index[1]

        print(
            f"Latitude: {latitudes[lat_index]:.4f}, "
            f"Longitude: {longitudes[lon_index]:.4f}, "
            f"Salinity: {values[lat_index, lon_index]:.2f} PSU"
        )

ds.close()