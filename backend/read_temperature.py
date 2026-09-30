import xarray as xr

ds = xr.open_dataset("test-data/temperature3.nc")

print(ds)

temperature = ds["thetao"]

print("\nLatitude:", ds.latitude.values)
print("Longitude:", ds.longitude.values)
print("Depth:", ds.depth.values)
print("Temperature:", temperature.values)