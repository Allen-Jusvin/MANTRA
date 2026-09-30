import xarray as xr
import numpy as np

file_path = "test-data/temperature-depth.nc"

ds = xr.open_dataset(file_path)

print(ds)

temperature = ds["thetao"]

print("\nDimensions:", temperature.dims)
print("Shape:", temperature.shape)

print("\nDepth levels:")
print(ds["depth"].values)

print("\nNumber of depth levels:", len(ds["depth"]))

values = temperature.values

print("\nValid values:", np.isfinite(values).sum())
print("NaN values:", np.isnan(values).sum())

ds.close()