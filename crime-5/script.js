// script.js

document.getElementById("process-data").addEventListener("click", async () => {
  const fileInput = document.getElementById("file-upload");
  if (fileInput.files.length === 0) {
    alert("Please select a zip file to upload.");
    return;
  }

  const file = fileInput.files[0];

  try {
    const data = await extractDataFromZip(file);
    preprocessAndTrain(data);
  } catch (error) {
    console.error("Error processing data:", error);
    alert("An error occurred while processing the data.");
  }
});

// Function to extract data from the uploaded zip file
async function extractDataFromZip(file) {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);

  const data = [];

  for (const [fileName, fileData] of Object.entries(contents.files)) {
    if (fileName.endsWith("-street.csv")) {
      const csvContent = await fileData.async("string");
      const parsedData = Papa.parse(csvContent, { header: true }).data;
      data.push(...parsedData);
    }
  }

  return data;
}

// Function to preprocess data and train the model
function preprocessAndTrain(data) {
  const cleanedData = data.filter(
    (record) => record["Month"] && record["Crime type"]
  );
  const crimeCounts = {};

  cleanedData.forEach((record) => {
    const month = record["Month"];
    if (!crimeCounts[month]) {
      crimeCounts[month] = 0;
    }
    crimeCounts[month]++;
  });

  const months = Object.keys(crimeCounts).sort();
  const counts = months.map((month) => crimeCounts[month]);
  const monthsAsNumbers = months.map((_, index) => index);

  // Generate seasonal features (sine and cosine) and a linear trend
  const features = generateSeasonalFeatures(monthsAsNumbers);

  trainSimpleSeasonalModel(features, counts, months);
}

// Function to create seasonal features
function generateSeasonalFeatures(inputs) {
  return inputs.map((x) => {
    const month = x % 12; // month for cyclical seasonality
    const sinMonth = Math.sin((2 * Math.PI * month) / 12);
    const cosMonth = Math.cos((2 * Math.PI * month) / 12);
    return [x, sinMonth, cosMonth]; // Linear trend + seasonal features
  });
}

// Function to train a model with seasonal features only
async function trainSimpleSeasonalModel(features, labels, months) {
  const inputTensor = tf.tensor2d(features);
  const labelTensor = tf.tensor1d(labels);

  const inputMax = inputTensor.max();
  const inputMin = inputTensor.min();
  const labelMax = labelTensor.max();
  const labelMin = labelTensor.min();

  const normalizedInputs = inputTensor
    .sub(inputMin)
    .div(inputMax.sub(inputMin));
  const normalizedLabels = labelTensor
    .sub(labelMin)
    .div(labelMax.sub(labelMin));

  const model = tf.sequential();
  model.add(
    tf.layers.dense({ inputShape: [3], units: 10, activation: "relu" })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: tf.train.adam(0.01), loss: "meanSquaredError" });

  await model.fit(normalizedInputs, normalizedLabels, {
    epochs: 500,
    callbacks: tfvis.show.fitCallbacks(
      { name: "Training Performance" },
      ["loss"],
      { height: 200, callbacks: ["onEpochEnd"] }
    ),
  });

  predictFutureWithSeasonality(
    model,
    features,
    labels,
    inputMax,
    inputMin,
    labelMax,
    labelMin,
    months
  );
}

// Function to predict future crime data using the model with seasonal features
function predictFutureWithSeasonality(
  model,
  features,
  labels,
  inputMax,
  inputMin,
  labelMax,
  labelMin,
  months
) {
  const numMonthsToPredict = 24;
  const futureFeatures = [];
  const futureMonths = [];

  for (let i = 1; i <= numMonthsToPredict; i++) {
    const nextIndex = features.length + i;
    const month = nextIndex % 12; // monthly cyclical pattern
    const sinMonth = Math.sin((2 * Math.PI * month) / 12);
    const cosMonth = Math.cos((2 * Math.PI * month) / 12);
    futureFeatures.push([nextIndex, sinMonth, cosMonth]);

    const lastMonthDate = new Date(months[months.length - 1] + "-01");
    lastMonthDate.setMonth(lastMonthDate.getMonth() + i);
    const futureMonth = lastMonthDate.toISOString().slice(0, 7);
    futureMonths.push(futureMonth);
  }

  const futureFeatureTensor = tf.tensor2d(futureFeatures);
  const normalizedFutureFeatures = futureFeatureTensor
    .sub(inputMin)
    .div(inputMax.sub(inputMin));

  const normalizedPredictions = model.predict(normalizedFutureFeatures);
  const unnormalizedPredictions = normalizedPredictions
    .mul(labelMax.sub(labelMin))
    .add(labelMin);

  const futurePredictions = Array.from(unnormalizedPredictions.dataSync());

  console.log("Future Predictions:", futurePredictions);

  // Generate annotations based on predicted data
  const annotations = generatePointAnnotations(futurePredictions, futureMonths);
  visualizeResultsWithSeasonality(
    features,
    labels,
    futureFeatures,
    futurePredictions,
    months,
    futureMonths,
    annotations
  );
}

// Function to generate point annotations based on peaks and troughs
function generatePointAnnotations(predictions, months) {
  const annotations = [];
  for (let i = 1; i < predictions.length - 1; i++) {
    if (
      predictions[i] > predictions[i - 1] &&
      predictions[i] > predictions[i + 1]
    ) {
      // Peak
      annotations.push({
        type: "point",
        xValue: months[i],
        yValue: predictions[i],
        backgroundColor: "red",
        radius: 5,
        label: {
          enabled: true,
          content: `Peak: ${Math.round(predictions[i])}`,
          position: "top",
        },
      });
    } else if (
      predictions[i] < predictions[i - 1] &&
      predictions[i] < predictions[i + 1]
    ) {
      // Trough
      annotations.push({
        type: "point",
        xValue: months[i],
        yValue: predictions[i],
        backgroundColor: "blue",
        radius: 5,
        label: {
          enabled: true,
          content: `Trough: ${Math.round(predictions[i])}`,
          position: "bottom",
        },
      });
    }
  }
  return annotations;
}

// Visualization function with point annotations
function visualizeResultsWithSeasonality(
  features,
  labels,
  futureFeatures,
  futurePredictions,
  months,
  futureMonths,
  annotations
) {
  const chartLabels = months.concat(futureMonths);
  const actualData = labels;
  const predictedData = new Array(labels.length)
    .fill(null)
    .concat(futurePredictions);

  const datasetActual = {
    label: "Actual Crimes",
    data: actualData,
    backgroundColor: "rgba(54, 162, 235, 0.5)",
    borderColor: "rgba(54, 162, 235, 1)",
    fill: false,
    tension: 0.1,
  };

  const datasetPredicted = {
    label: "Predicted Crimes",
    data: predictedData,
    backgroundColor: "rgba(255, 99, 132, 0.5)",
    borderColor: "rgba(255, 99, 132, 1)",
    fill: false,
    tension: 0.1,
    // borderDash: [5, 5],
  };

  const existingChart = Chart.getChart("crimeChart");
  if (existingChart) {
    existingChart.destroy();
  }

  const ctx = document.getElementById("crimeChart");
  if (ctx) {
    ctx.remove();
  }
  const canvas = document.createElement("canvas");
  canvas.id = "crimeChart";
  document.getElementById("visualization").appendChild(canvas);

  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: chartLabels,
      datasets: [datasetActual, datasetPredicted],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          type: "category",
          display: true,
          title: {
            display: true,
            text: "Months",
          },
        },
        y: {
          display: true,
          title: {
            display: true,
            text: "Number of Crimes",
          },
        },
      },
      plugins: {
        title: {
          display: true,
          text: "Crime Count Predictions with Point Annotations",
        },
        annotation: {
          annotations: annotations,
        },
      },
    },
  });
}
