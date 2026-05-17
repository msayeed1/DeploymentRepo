require(["DS/DataDragAndDrop/DataDragAndDrop", "DS/PlatformAPI/PlatformAPI",
    "WidgetDemo/script/Service", "WidgetDemo/script/compare"],
    function (DataDragAndDrop, PlatformAPI, apiService, modelCompare) {

        var droppedVersions = []; // holds up to 2 dropped version objects
        var baseVersionData = null;
        var compareVersionData = null;

        var compareWidget = {

            onLoad: async function () {
                widget.body.innerHTML = "";

                // Build the drop zone UI
                var dropbox = widget.createElement("div", { "class": "mydropclass" });
                dropbox.style = "border:2px #c6c5c5 dashed; margin:10px; padding:5%; text-align:center";

                var dropimage = widget.createElement("img", {
                    src: "/Images/dropImage.png",
                    alt: "Dropbox Image"
                });
                dropbox.append(dropimage);

                var dropText = widget.createElement("div", { text: "Drop two model versions to compare" });
                dropText.style = "font-size:13px; color:#888; margin-top:8px";
                dropbox.append(dropText);

                dropbox.inject(widget.body);

                // Status area for showing dropped items
                var statusDiv = widget.createElement("div", { id: "statusArea" });
                statusDiv.style = "margin:10px; font-size:12px";
                widget.body.appendChild(statusDiv);

                // Initialize API service
                try {
                    await apiService.init();
                    console.log("Main: API Service initialized");
                } catch (err) {
                    console.error("Main: API Service initialization failed", err);
                }

                // Set up drag-and-drop
                var theInput = widget.body.querySelector(".mydropclass");
                DataDragAndDrop.droppable(theInput, {
                    drop: function (data) {
                        var objs = JSON.parse(data);
                        var objList = objs.data.items;

                        if (droppedVersions.length >= 2) {
                            alert("Two versions already selected. Click 'Clear' to reset.");
                            return;
                        }

                        objList.forEach(function (item) {
                            if (droppedVersions.length < 2) {
                                droppedVersions.push({
                                    objectId: item.objectId,
                                    objectType: item.objectType,
                                    displayName: item.displayName || item.objectId
                                });
                            }
                        });

                        compareWidget.updateStatus();

                        if (droppedVersions.length === 2) {
                            compareWidget.runComparison();
                        }
                    }
                });
            },

            /**
             * Update the status area showing dropped versions.
             */
            updateStatus: function () {
                var statusDiv = document.getElementById("statusArea");
                if (!statusDiv) return;

                var html = "<b>Versions selected:</b><br/>";
                droppedVersions.forEach(function (v, idx) {
                    var label = idx === 0 ? "Base" : "Compare";
                    html += label + ": " + compareWidget._escapeHtml(v.displayName) + " (" + compareWidget._escapeHtml(v.objectType) + ")<br/>";
                });

                if (droppedVersions.length < 2) {
                    html += "<i>Drop " + (2 - droppedVersions.length) + " more version(s) to compare</i>";
                }
                statusDiv.innerHTML = html;
            },

            /**
             * Run the full comparison between the two dropped versions.
             */
            runComparison: async function () {
                console.log("Main: Running comparison...");

                try {
                    // Fetch details for both versions in parallel
                    var results = await Promise.all([
                        apiService.getVersionDetails(droppedVersions[0].objectId),
                        apiService.getVersionDetails(droppedVersions[1].objectId)
                    ]);

                    baseVersionData = results[0].member ? results[0].member[0] : results[0];
                    compareVersionData = results[1].member ? results[1].member[0] : results[1];

                    // Compare attributes
                    var attrDiff = modelCompare.compareVersions(baseVersionData, compareVersionData);

                    // Fetch and compare structures in parallel
                    var structResults = await Promise.all([
                        apiService.expandStructure(droppedVersions[0].objectId),
                        apiService.expandStructure(droppedVersions[1].objectId)
                    ]);

                    var baseChildren = structResults[0].member || [];
                    var compChildren = structResults[1].member || [];

                    var structDiff = modelCompare.compareStructures(baseChildren, compChildren);

                    // Generate report
                    var report = modelCompare.generateReport(attrDiff, structDiff);
                    console.log("Main: Comparison report ->", report);

                    // Render results
                    compareWidget.renderResults(report);
                } catch (err) {
                    console.error("Main: Comparison failed", err);
                    alert("Failed to fetch version details. Please try again.");
                }
            },

            /**
             * Render the comparison results in the widget body.
             */
            renderResults: function (report) {
                // Remove previous results if any
                var existingResults = document.getElementById("compareResults");
                if (existingResults) {
                    existingResults.remove();
                }

                var container = document.createElement("div");
                container.id = "compareResults";
                container.style = "margin:10px; font-family:Arial,sans-serif; font-size:12px";

                // Header with version names
                var header = document.createElement("div");
                header.style = "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px";
                header.innerHTML = "<h3 style='margin:0'>Comparison Results</h3>";

                // Toolbar buttons
                var toolbar = document.createElement("div");

                var clearBtn = document.createElement("button");
                clearBtn.innerHTML = "Clear";
                clearBtn.style = "padding:5px 15px; margin-left:8px; background:#368ec4; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px";
                clearBtn.addEventListener("click", function () {
                    droppedVersions = [];
                    baseVersionData = null;
                    compareVersionData = null;
                    compareWidget.onLoad();
                });
                toolbar.appendChild(clearBtn);

                header.appendChild(toolbar);
                container.appendChild(header);

                // Summary cards
                var summaryDiv = document.createElement("div");
                summaryDiv.style = "display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap";

                summaryDiv.appendChild(compareWidget._createSummaryCard("Attributes Modified", report.attributes.modified, "#ff9800"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Attributes Added", report.attributes.added, "#4caf50"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Attributes Removed", report.attributes.removed, "#f44336"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Attributes Identical", report.attributes.identical, "#2196f3"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Structure Added", report.structure.added, "#4caf50"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Structure Removed", report.structure.removed, "#f44336"));
                summaryDiv.appendChild(compareWidget._createSummaryCard("Structure Modified", report.structure.modified, "#ff9800"));

                container.appendChild(summaryDiv);

                // Attribute differences table
                if (report.attributes.details.modified.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Modified Attributes",
                        ["Attribute", "Base Value", "Compare Value"],
                        report.attributes.details.modified.map(function (item) {
                            return [item.attribute, String(item.baseValue), String(item.compareValue)];
                        }),
                        "#fff3e0"
                    ));
                }

                if (report.attributes.details.added.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Added Attributes (in Compare)",
                        ["Attribute", "Value"],
                        report.attributes.details.added.map(function (item) {
                            return [item.attribute, String(item.compareValue)];
                        }),
                        "#e8f5e9"
                    ));
                }

                if (report.attributes.details.removed.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Removed Attributes (from Base)",
                        ["Attribute", "Value"],
                        report.attributes.details.removed.map(function (item) {
                            return [item.attribute, String(item.baseValue)];
                        }),
                        "#ffebee"
                    ));
                }

                // Structure differences
                if (report.structure.details.added.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Structure - Added Components",
                        ["Identifier"],
                        report.structure.details.added.map(function (item) {
                            return [item.identifier];
                        }),
                        "#e8f5e9"
                    ));
                }

                if (report.structure.details.removed.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Structure - Removed Components",
                        ["Identifier"],
                        report.structure.details.removed.map(function (item) {
                            return [item.identifier];
                        }),
                        "#ffebee"
                    ));
                }

                if (report.structure.details.modified.length > 0) {
                    container.appendChild(compareWidget._createDiffTable(
                        "Structure - Modified Components",
                        ["Identifier", "Changes"],
                        report.structure.details.modified.map(function (item) {
                            var changesSummary = item.differences.modified.map(function (d) {
                                return d.attribute + ": " + d.baseValue + " → " + d.compareValue;
                            }).join("; ");
                            return [item.identifier, changesSummary];
                        }),
                        "#fff3e0"
                    ));
                }

                // No differences message
                if (report.attributes.totalChanges === 0 && report.structure.totalChanges === 0) {
                    var noChanges = document.createElement("p");
                    noChanges.style = "text-align:center; color:#4caf50; font-size:14px; margin-top:20px";
                    noChanges.innerText = "No differences found between the two versions.";
                    container.appendChild(noChanges);
                }

                widget.body.appendChild(container);
            },

            // --- UI Helper Methods ---

            _createSummaryCard: function (label, count, color) {
                var card = document.createElement("div");
                card.style = "background:" + color + "; color:white; padding:10px 15px; border-radius:6px; min-width:100px; text-align:center";
                card.innerHTML = "<div style='font-size:20px; font-weight:bold'>" + count + "</div>" +
                    "<div style='font-size:11px'>" + compareWidget._escapeHtml(label) + "</div>";
                return card;
            },

            _createDiffTable: function (title, headers, rows, bgColor) {
                var wrapper = document.createElement("div");
                wrapper.style = "margin-bottom:15px";

                var titleEl = document.createElement("h4");
                titleEl.style = "margin:5px 0";
                titleEl.innerText = title;
                wrapper.appendChild(titleEl);

                var table = document.createElement("table");
                table.style = "width:100%; border-collapse:collapse; font-size:12px";

                // Header row
                var thead = document.createElement("thead");
                var headRow = document.createElement("tr");
                headers.forEach(function (h) {
                    var th = document.createElement("th");
                    th.style = "border:1px solid #ddd; padding:6px 8px; background:#f5f5f5; text-align:left";
                    th.innerText = h;
                    headRow.appendChild(th);
                });
                thead.appendChild(headRow);
                table.appendChild(thead);

                // Data rows
                var tbody = document.createElement("tbody");
                rows.forEach(function (row) {
                    var tr = document.createElement("tr");
                    tr.style = "background:" + bgColor;
                    row.forEach(function (cell) {
                        var td = document.createElement("td");
                        td.style = "border:1px solid #ddd; padding:5px 8px";
                        td.innerText = cell;
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                wrapper.appendChild(table);

                return wrapper;
            },

            _escapeHtml: function (str) {
                if (typeof str !== "string") return String(str);
                var div = document.createElement("div");
                div.appendChild(document.createTextNode(str));
                return div.innerHTML;
            }
        };

        // Auto-start on widget load
        compareWidget.onLoad();
    });