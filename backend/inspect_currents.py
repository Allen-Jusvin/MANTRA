import xarray as xr
import numpy as np

file_path = "test-data/currents-area.nc"

ds = xr.open_dataset(file_path)

print(ds)

uo = ds["uo"].squeeze()
vo = ds["vo"].squeeze()

print("\nUO shape:", uo.shape)
print("VO shape:", vo.shape)

u_values = uo.values
v_values = vo.values

valid = np.isfinite(u_values) & np.isfinite(v_values)

print("\nValid current cells:", valid.sum())
print("Invalid cells:", (~valid).sum())

if valid.any():

    speed = np.sqrt(
        u_values[valid] ** 2 +
        v_values[valid] ** 2
    )

    print("\nMinimum current speed:", speed.min(), "m/s")
    print("Maximum current speed:", speed.max(), "m/s")

    latitudes = ds["latitude"].values
    longitudes = ds["longitude"].values

    print("\nSome valid current values:")

    valid_indices = np.argwhere(valid)

    for index in valid_indices[:20]:

        lat_index = index[0]
        lon_index = index[1]

        u = float(u_values[lat_index, lon_index])
        v = float(v_values[lat_index, lon_index])

        current_speed = np.sqrt(u**2 + v**2)

        print(
            f"Latitude: {latitudes[lat_index]:.4f}, "
            f"Longitude: {longitudes[lon_index]:.4f}, "
            f"U: {u:.4f} m/s, "
            f"V: {v:.4f} m/s, "
            f"Speed: {current_speed:.4f} m/s"
        )

ds.close()