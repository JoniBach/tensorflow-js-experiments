async function printZipStructure(file) {
  const zip = new JSZip();
  const outputElement = document.getElementById("zipStructure");

  try {
    // Load ZIP file into JSZip
    const content = await file.arrayBuffer();
    const loadedZip = await zip.loadAsync(content);

    // Initialize a nested object to store folder structure
    const root = {};
    const rootName = file.name.split(".").slice(0, -1).join("."); // Get the ZIP file name without the extension

    // Helper function to build the nested folder structure
    function addFileToStructure(pathArray, node) {
      if (pathArray.length === 1) {
        node[pathArray[0]] = "file"; // Base case: it's a file
      } else {
        const folder = pathArray[0];
        if (!node[folder]) {
          node[folder] = {}; // Create a new folder if it doesn't exist
        }
        addFileToStructure(pathArray.slice(1), node[folder]); // Recurse into the next level
      }
    }

    // Build the structure from each file in the ZIP
    loadedZip.forEach((relativePath, file) => {
      const pathArray = relativePath.split("/");
      addFileToStructure(pathArray, root);
    });

    // Function to convert nested structure to ASCII tree format
    function buildAsciiTree(node, depth = 0, prefix = "") {
      let structure = "";
      const entries = Object.entries(node);
      entries.forEach(([key, value], index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const newPrefix = prefix + (isLast ? "    " : "│   ");

        if (value === "file") {
          structure += `${prefix}${connector}${key}\n`;
        } else {
          structure += `${prefix}${connector}${key}\n`;
          structure += buildAsciiTree(value, depth + 1, newPrefix); // Recurse into folders
        }
      });
      return structure;
    }

    // Start building the ASCII tree with the root name
    let structureText = `${rootName}\n`;
    structureText += buildAsciiTree(root);

    // Output the structure to the <pre> element in ASCII format
    outputElement.textContent = structureText;
  } catch (error) {
    outputElement.textContent =
      "An error occurred while processing the ZIP file: " + error.message;
    console.error("Error processing ZIP file:", error);
  }
}

// Event listener for file input
document
  .getElementById("fileInput")
  .addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (file) {
      printZipStructure(file);
    } else {
      document.getElementById("zipStructure").textContent = "No file selected";
    }
  });

// Copy to Clipboard functionality
document.getElementById("copyButton").addEventListener("click", function () {
  const zipStructureText = document.getElementById("zipStructure").textContent;
  navigator.clipboard
    .writeText(zipStructureText)
    .then(() => {
      alert("Structure copied to clipboard!");
    })
    .catch((error) => {
      console.error("Failed to copy structure:", error);
    });
});
