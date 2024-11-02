// script.js
document
  .getElementById("fileUpload")
  .addEventListener("change", handleFileUpload);

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const zip = await JSZip.loadAsync(file);
  const crimeData = {};
  const crimeTypes = new Set();

  for (const filename of Object.keys(zip.files)) {
    if (filename.endsWith(".csv")) {
      const content = await zip.files[filename].async("string");
      const rows = content.split("\n").slice(1);

      rows.forEach((row) => {
        const cols = row.split(",");
        const [
          crimeId,
          month,
          ,
          ,
          longitude,
          latitude,
          ,
          ,
          lsoaName,
          crimeType,
        ] = cols;

        // Filter out rows with undefined or NaN values for important fields
        if (
          !month ||
          isNaN(Number(longitude)) ||
          isNaN(Number(latitude)) ||
          !crimeType
        ) {
          return;
        }

        if (!crimeData[month]) crimeData[month] = { total: 0, types: {} };
        crimeData[month].total++;
        crimeTypes.add(crimeType);

        if (!crimeData[month].types[crimeType]) {
          crimeData[month].types[crimeType] = { count: 0, details: [] };
        }

        crimeData[month].types[crimeType].count++;
        crimeData[month].types[crimeType].details.push({
          longitude,
          latitude,
          reportedBy: cols[2],
        });
      });
    }
  }

  // Render chart with cleaned data
  renderChart(crimeData, Array.from(crimeTypes));
}

function renderChart(crimeData, crimeTypes) {
  const ctx = document.getElementById("crimeChart").getContext("2d");

  const labels = Object.keys(crimeData).sort();
  const totalCrimes = labels.map((month) => crimeData[month].total);

  const colors = [
    "#FF6384",
    "#36A2EB",
    "#FFCE56",
    "#4BC0C0",
    "#9966FF",
    "#FF9F40",
    "#FFCD56",
    "#36A2EB",
    "#4BC0C0",
    "#FF6384",
    "#FFCE56",
    "#9966FF",
  ];

  const greyColor = "lightgrey"; // Define a light grey color for inactive datasets

  const datasets = [
    {
      label: "Total Crimes",
      data: totalCrimes,
      fill: false,
      borderColor: "blue",
      backgroundColor: "blue",
      originalColor: "blue",
      tension: 0.1,
    },
  ];

  crimeTypes.forEach((type, index) => {
    const typeData = labels.map(
      (month) => crimeData[month].types[type]?.count || 0
    );

    datasets.push({
      label: type,
      data: typeData,
      fill: false,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length],
      originalColor: colors[index % colors.length],
      tension: 0.1,
    });
  });

  // Destroy any existing chart instance
  if (window.crimeChart instanceof Chart) {
    window.crimeChart.destroy();
  }

  // Create the chart
  window.crimeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: {
              size: 10,
            },
            // Add legend hover functionality
            onHover: function (event, legendItem, legend) {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset, index) => {
                if (index !== legendItem.datasetIndex) {
                  dataset.borderColor = greyColor;
                  dataset.backgroundColor = greyColor;
                }
              });
              chart.update();
            },
            // Restore colors when not hovering
            onLeave: function (event, legendItem, legend) {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset) => {
                dataset.borderColor = dataset.originalColor;
                dataset.backgroundColor = dataset.originalColor;
              });
              chart.update();
            },
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const month = context.label;
              const type = context.dataset.label;
              const details = crimeData[month].types[type]?.details || [];

              const detailsText = details
                .map(
                  (d) =>
                    `Reported By: ${d.reportedBy}, Lat: ${d.latitude}, Long: ${d.longitude}`
                )
                .join("\n");

              return `${type}: ${context.raw} - Details:\n${detailsText}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Month",
          },
        },
        y: {
          title: {
            display: true,
            text: "Number of Crimes",
          },
        },
      },
    },
  });
}
