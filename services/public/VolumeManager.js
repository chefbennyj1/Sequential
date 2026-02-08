export async function getVolumeItems() {
  try {
    const res = await fetch('/api/volumes');
    const data = await res.json();

    if (!data.ok) {
      console.error("Failed to load volumes:", data.message);
      return;
    }

    console.log("Views:", data.volumes);
    return data.volumes; // <- your function to display them
  } catch (err) {
    console.error("Error fetching volumes:", err);
  }
}