define("WidgetDemo/script/Service", ["DS/WAFData/WAFData", "DS/i3DXCompassServices/i3DXCompassServices"],
    function (WAFData, BaseUrl) {

        var _urlBASE = "";
        var _csrfToken = "";
        var _securityContext = "";

        var apiService = {

            /**
             * Initialize the service: resolve base URL, CSRF token, and security context.
             * @returns {Promise} Resolves when all initialization steps are complete.
             */
            init: async function () {
                await apiService.setBaseURL();
                await apiService.setCSRF();
                await apiService.getSecurityContextPreference();
            },

            getBaseURL: function () {
                return _urlBASE;
            },

            getSecurityContext: function () {
                return _securityContext;
            },

            /**
             * Resolve the 3DSpace base URL from the platform.
             * @returns {Promise}
             */
            setBaseURL: function () {
                return new Promise(function (resolve, reject) {
                    BaseUrl.getServiceUrl({
                        platformId: widget.getValue("x3dPlatformId"),
                        serviceName: "3DSpace",
                        onComplete: function (URLResult) {
                            _urlBASE = URLResult + "/";
                            console.log("Service: Base URL resolved ->", _urlBASE);
                            resolve();
                        },
                        onFailure: function (error) {
                            console.error("Service: Failed to resolve Base URL");
                            reject(new Error("Failed to resolve Base URL"));
                        }
                    });
                });
            },

            /**
             * Fetch CSRF token for the current session.
             * @returns {Promise}
             */
            setCSRF: function () {
                var urlWAF = _urlBASE + "resources/v1/application/CSRF";
                return new Promise(function (resolve, reject) {
                    WAFData.authenticatedRequest(urlWAF, {
                        method: "GET",
                        headers: {},
                        data: {},
                        type: "json",
                        onComplete: function (dataResp) {
                            _csrfToken = dataResp.csrf.value;
                            console.log("Service: CSRF Token obtained ->", _csrfToken);
                            resolve();
                        },
                        onFailure: function (error) {
                            console.error("Service: Failed to get CSRF token", error);
                            reject(error);
                        }
                    });
                });
            },

            /**
             * Fetch the current user's preferred security context.
             * @returns {Promise}
             */
            getSecurityContextPreference: async function () {
                var urlObjWAF = _urlBASE + "resources/modeler/pno/person?current=true&select=collabspaces&select=preferredcredentials";
                var response = await apiService.callWebService("GET", urlObjWAF, "");
                if (response.preferredcredentials) {
                    var creds = response.preferredcredentials;
                    _securityContext = creds.role.name + "." + creds.organization.name + "." + creds.collabspace.name;
                    console.log("Service: Security Context ->", _securityContext);
                }
                // Allow override from widget preference
                var prefCtx = widget.getValue("Credentials");
                if (prefCtx) {
                    _securityContext = prefCtx;
                }
            },

            /**
             * Generic authenticated web service call.
             * @param {string} method - HTTP method (GET/POST/PUT/PATCH)
             * @param {string} url - Full endpoint URL
             * @param {string|object} data - Request body (stringified JSON for POST/PUT)
             * @returns {Promise} Resolves with the response data, rejects on failure.
             */
            callWebService: function (method, url, data) {
                var headerWAF = {
                    SecurityContext: _securityContext,
                    Accept: "application/json",
                    ENO_CSRF_TOKEN: _csrfToken,
                    "Content-Type": "application/json"
                };

                return new Promise(function (resolve, reject) {
                    WAFData.authenticatedRequest(url, {
                        method: method,
                        headers: headerWAF,
                        data: data,
                        type: "json",
                        onComplete: function (dataResp) {
                            console.log("Service: callWebService success ->", url);
                            resolve(dataResp);
                        },
                        onFailure: function (error) {
                            console.error("Service: callWebService failed ->", url, error);
                            reject(error);
                        }
                    });
                });
            },

            /**
             * Get all versions (revisions) of a given engineering item.
             * @param {string} objectId - Physical ID of the product/part
             * @returns {Promise} Resolves with version data.
             */
            getModelVersions: async function (objectId) {
                var url = _urlBASE + "resources/v1/modeler/dseng/dseng:EngItem/" + objectId + "/dseng:EngRepresentation";
                try {
                    return await apiService.callWebService("GET", url, "");
                } catch (e) {
                    // Fallback: try fetching revisions from expand
                    var expandUrl = _urlBASE + "resources/v1/modeler/dseng/dseng:EngItem/" + objectId;
                    return await apiService.callWebService("GET", expandUrl, "");
                }
            },

            /**
             * Get details of a specific model version by its physical ID.
             * @param {string} versionId - Physical ID of the version/revision
             * @returns {Promise} Resolves with version details.
             */
            getVersionDetails: function (versionId) {
                var url = _urlBASE + "resources/v1/modeler/dspfl/dspfl:ModelVersion/" + versionId;
                return apiService.callWebService("GET", url, "");
            },

            /**
             * Expand the BOM/structure of a given product version.
             * @param {string} versionId - Physical ID of the version
             * @returns {Promise} Resolves with structure data.
             */
            expandStructure: function (versionId) {
                var url = _urlBASE + "resources/v1/modeler/dspfl/dspfl:ModelVersion/" + versionId + "/expand";
                return apiService.callWebService("GET", url, "");
            },

            /**
             * Navigate relationships for a given object.
             * @param {string} objectId - Physical ID
             * @param {Array} relations - Array of relation type strings
             * @returns {Promise} Resolves with navigation data.
             */
            navigateRelations: async function (objectId, relations) {
                var prefUrl = _urlBASE + "resources/enorelnav/v2/navigate/setPreferences";
                var prefBody = {
                    widgetId: "ModelCompare_Widget",
                    relations: relations,
                    allRelationsMode: false,
                    attributesForView: ["ds6w:status", "ds6w:type", "ds6w:identifier", "ds6w:description"],
                    lang: "en",
                    ghostMode: false
                };
                await apiService.callWebService("POST", prefUrl, JSON.stringify(prefBody));

                var navUrl = _urlBASE + "resources/enorelnav/v2/navigate/getEcosystem";
                var navBody = {
                    widgetId: "ModelCompare_Widget",
                    responseMode: "objectsByPatterns",
                    ids: [objectId]
                };
                return await apiService.callWebService("POST", navUrl, JSON.stringify(navBody));
            }
        };

        return apiService;
    });