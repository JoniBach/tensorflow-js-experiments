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
  // Handle missing values and filter necessary columns
  const cleanedData = data.filter(
    (record) => record["Month"] && record["Crime type"]
  );

  // Aggregate data: Count crimes per month
  const crimeCounts = {};

  cleanedData.forEach((record) => {
    const month = record["Month"];
    if (!crimeCounts[month]) {
      crimeCounts[month] = 0;
    }
    crimeCounts[month]++;
  });

  // Sort months chronologically
  const months = Object.keys(crimeCounts).sort();
  const counts = months.map((month) => crimeCounts[month]);

  // Convert months to numerical indices for the model
  const monthIndices = months.map((_, index) => index);

  // Proceed to model creation and training
  trainModel(monthIndices, counts, months);
}

// Function to create the TensorFlow.js model
function createModel() {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({ inputShape: [1], units: 64, activation: "relu" })
  );
  model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: tf.train.adam(), loss: "meanSquaredError" });

  return model;
}

// Function to train the model
async function trainModel(inputs, labels, months) {
  const model = createModel();

  // Convert data to tensors
  const inputTensor = tf.tensor2d(inputs, [inputs.length, 1]);
  const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

  // Normalize the data
  const {
    normalizedInputs,
    normalizedLabels,
    inputMax,
    inputMin,
    labelMax,
    labelMin,
  } = normalizeData(inputTensor, labelTensor);

  // Train the model
  await model.fit(normalizedInputs, normalizedLabels, {
    epochs: 100,
    callbacks: tfvis.show.fitCallbacks(
      { name: "Training Performance" },
      ["loss"],
      { height: 200, callbacks: ["onEpochEnd"] }
    ),
  });

  // Make predictions
  predictFuture(
    model,
    inputs,
    labels,
    inputMax,
    inputMin,
    labelMax,
    labelMin,
    months
  );
}

// Function to normalize data
function normalizeData(inputTensor, labelTensor) {
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

  return {
    normalizedInputs,
    normalizedLabels,
    inputMax,
    inputMin,
    labelMax,
    labelMin,
  };
}

// Function to predict future crime data
function predictFuture(
  model,
  inputs,
  labels,
  inputMax,
  inputMin,
  labelMax,
  labelMin,
  months
) {
  const numMonthsToPredict = 12; // Predict for the next 12 months
  const lastInput = inputs[inputs.length - 1];

  const futureInputs = [];
  for (let i = 1; i <= numMonthsToPredict; i++) {
    futureInputs.push(lastInput + i);
  }

  const futureInputTensor = tf.tensor2d(futureInputs, [futureInputs.length, 1]);

  // Normalize future inputs
  const normalizedFutureInputs = futureInputTensor
    .sub(inputMin)
    .div(inputMax.sub(inputMin));

  // Predict and un-normalize
  const normalizedPredictions = model.predict(normalizedFutureInputs);
  const unnormalizedPredictions = normalizedPredictions
    .mul(labelMax.sub(labelMin))
    .add(labelMin);

  const predictedCounts = Array.from(unnormalizedPredictions.dataSync());

  // Generate future months labels
  const futureMonths = [];
  for (let i = 1; i <= numMonthsToPredict; i++) {
    const lastMonth = new Date(months[months.length - 1] + "-01");
    lastMonth.setMonth(lastMonth.getMonth() + i);
    const futureMonth = lastMonth.toISOString().slice(0, 7);
    futureMonths.push(futureMonth);
  }

  // Visualize results
  visualizeResults(
    inputs,
    labels,
    futureInputs,
    predictedCounts,
    months,
    futureMonths
  );
}
// Function to visualize the results
function visualizeResults(
  inputs,
  labels,
  futureInputs,
  futurePredictions,
  months,
  futureMonths
) {
  // Prepare data for Chart.js

  // Actual data
  const chartLabelsActual = months;
  const chartDataActual = labels;

  // Predicted data
  const chartLabelsPredicted = futureMonths;
  const chartDataPredicted = futurePredictions;

  // Combine labels and data
  const chartLabels = chartLabelsActual.concat(chartLabelsPredicted);
  const chartData = chartDataActual.concat(chartDataPredicted);

  // Create datasets with correct data alignment
  const datasetActual = {
    label: "Actual Crimes",
    data: chartDataActual,
    backgroundColor: "rgba(54, 162, 235, 0.5)",
    borderColor: "rgba(54, 162, 235, 1)",
    fill: false,
    tension: 0.1,
    spanGaps: true,
  };

  const datasetPredicted = {
    label: "Predicted Crimes",
    data: new Array(chartDataActual.length)
      .fill(null)
      .concat(chartDataPredicted),
    backgroundColor: "rgba(255, 99, 132, 0.5)",
    borderColor: "rgba(255, 99, 132, 1)",
    fill: false,
    tension: 0.1,
    spanGaps: true,
  };

  // Remove existing chart if any
  const existingChart = Chart.getChart("crimeChart");
  if (existingChart) {
    existingChart.destroy();
  }

  // Create or select canvas
  const ctx = document.getElementById("crimeChart");
  if (ctx) {
    ctx.remove();
  }
  const canvas = document.createElement("canvas");
  canvas.id = "crimeChart";
  document.getElementById("visualization").appendChild(canvas);

  // Create the chart
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
          text: "Crime Count Predictions",
        },
      },
    },
  });
}
