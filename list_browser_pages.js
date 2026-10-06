async function run() {
  try {
    const res = await fetch('http://127.0.0.1:51296/json');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching browser JSON:', err);
  }
}
run();
