// predictions.js
document
  .getElementById("fileUpload")
  .addEventListener("change", handleFileUpload);

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const zip = await JSZip.loadAsync(file);
  const crimeData = {};

  for (const filename of Object.keys(zip.files)) {
    if (filename.endsWith(".csv")) {
      const content = await zip.files[filename].async("string");
      const rows = content.split("\n").slice(1);

      rows.forEach((row) => {
        const cols = row.split(",");
        const [, month] = cols;

        // Skip invalid rows
        if (!month || month.trim() === "") return;

        if (!crimeData[month]) crimeData[month] = 0;
        crimeData[month]++;
      });
    }
  }

  // Filter and validate crimeCounts
  const months = Object.keys(crimeData).sort();
  const crimeCounts = months
    .map((month) => crimeData[month])
    .filter((count) => count !== undefined && count > 0); // Exclude 0 and undefined counts

  // Train the prediction model only if we have enough data
  if (crimeCounts.length > 12) {
    await trainModel(crimeCounts);
    renderPredictionChart(crimeCounts);
  } else {
    console.warn("Not enough valid data to train the model.");
  }
}

async function trainModel(crimeCounts) {
  const dataLength = crimeCounts.length;
  const lookBack = 12;

  // Prepare training data
  const xs = [];
  const ys = [];
  for (let i = lookBack; i < dataLength; i++) {
    const inputSlice = crimeCounts.slice(i - lookBack, i);
    const targetValue = crimeCounts[i];

    // Ensure inputSlice and targetValue are valid numbers
    if (inputSlice.every((val) => val > 0) && targetValue > 0) {
      xs.push(inputSlice);
      ys.push(targetValue);
    }
  }

  const inputTensor = tf.tensor2d(xs);
  const outputTensor = tf.tensor2d(ys, [ys.length, 1]);

  // Define and compile the model
  const model = tf.sequential();
  model.add(
    tf.layers.dense({ units: 64, activation: "relu", inputShape: [lookBack] })
  );
  model.add(tf.layers.dense({ units: 32, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({
    optimizer: tf.train.adam(),
    loss: "meanSquaredError",
  });

  // Train the model
  await model.fit(inputTensor, outputTensor, {
    epochs: 200,
    callbacks: tfvis.show.fitCallbacks(
      { name: "Training Performance" },
      ["loss"],
      { height: 200, callbacks: ["onEpochEnd"] }
    ),
  });

  window.predictionModel = model;
  inputTensor.dispose();
  outputTensor.dispose();
}

function renderPredictionChart(crimeCounts) {
  const lookBack = 12;
  const predictionPeriod = crimeCounts.length; // Predict an equal number of months

  let inputSequence = crimeCounts.slice(-lookBack);

  const predictions = [];
  for (let i = 0; i < predictionPeriod; i++) {
    const inputTensor = tf.tensor2d([inputSequence]);
    const prediction = window.predictionModel.predict(inputTensor);
    let predictedValue = prediction.dataSync()[0];

    // Handle invalid predictions by setting a reasonable default value
    if (isNaN(predictedValue) || predictedValue <= 0) {
      predictedValue =
        inputSequence.reduce((a, b) => a + b) / inputSequence.length; // Use the average of the last sequence
    }

    predictions.push(predictedValue);

    // Update the input sequence
    inputSequence = inputSequence.slice(1).concat(predictedValue);
    inputTensor.dispose();
    prediction.dispose();
  }

  // Render chart with historical data + predictions
  const ctx = document.getElementById("predictionChart").getContext("2d");
  const labels = Array.from(
    { length: crimeCounts.length + predictionPeriod },
    (_, i) => i + 1
  );
  const extendedCrimeCounts = crimeCounts.concat(predictions);

  new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Historical Crimes",
          data: crimeCounts,
          fill: false,
          borderColor: "blue",
        },
        {
          label: "Predicted Crimes",
          data: extendedCrimeCounts,
          fill: false,
          borderColor: "red",
          borderDash: [5, 5],
        },
      ],
    },
    options: {
      responsive: true,
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
