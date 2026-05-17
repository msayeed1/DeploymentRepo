define("WidgetDemo/script/compare", [], function () {

    var modelCompare = {

        // Attribute keys to ignore during comparison
        _ignoreKeys: ["cestamp", "modified", "originated", "id", "relateddata"],

        /**
         * Compare two model version objects and return a structured diff.
         * @param {object} baseVersion - The base (older) version object
         * @param {object} compareVersion - The version to compare against
         * @returns {object} { added: [], removed: [], modified: [], identical: [] }
         */
        compareVersions: function (baseVersion, compareVersion) {
            var result = {
                added: [],
                removed: [],
                modified: [],
                identical: []
            };

            if (!baseVersion || !compareVersion) {
                console.warn("Compare: One or both versions are null/undefined");
                return result;
            }

            var baseAttrs = modelCompare._flattenAttributes(baseVersion);
            var compAttrs = modelCompare._flattenAttributes(compareVersion);

            var allKeys = modelCompare._unionKeys(baseAttrs, compAttrs);

            allKeys.forEach(function (key) {
                if (modelCompare._ignoreKeys.indexOf(key.toLowerCase()) !== -1) {
                    return; // skip ignored keys
                }

                var inBase = baseAttrs.hasOwnProperty(key);
                var inComp = compAttrs.hasOwnProperty(key);

                if (inBase && inComp) {
                    if (modelCompare._deepEqual(baseAttrs[key], compAttrs[key])) {
                        result.identical.push({
                            attribute: key,
                            value: baseAttrs[key]
                        });
                    } else {
                        result.modified.push({
                            attribute: key,
                            baseValue: baseAttrs[key],
                            compareValue: compAttrs[key]
                        });
                    }
                } else if (inBase && !inComp) {
                    result.removed.push({
                        attribute: key,
                        baseValue: baseAttrs[key]
                    });
                } else if (!inBase && inComp) {
                    result.added.push({
                        attribute: key,
                        compareValue: compAttrs[key]
                    });
                }
            });

            return result;
        },

        /**
         * Compare the BOM/child structures of two versions.
         * @param {Array} baseChildren - Array of child objects from base version
         * @param {Array} compareChildren - Array of child objects from compare version
         * @returns {object} { added: [], removed: [], modified: [], identical: [] }
         */
        compareStructures: function (baseChildren, compareChildren) {
            var result = {
                added: [],
                removed: [],
                modified: [],
                identical: []
            };

            baseChildren = baseChildren || [];
            compareChildren = compareChildren || [];

            var baseMap = modelCompare._buildIdentifierMap(baseChildren);
            var compMap = modelCompare._buildIdentifierMap(compareChildren);

            // Check items in base
            Object.keys(baseMap).forEach(function (identifier) {
                if (compMap.hasOwnProperty(identifier)) {
                    // Exists in both — compare attributes
                    var attrDiff = modelCompare.compareVersions(baseMap[identifier], compMap[identifier]);
                    if (attrDiff.modified.length > 0 || attrDiff.added.length > 0 || attrDiff.removed.length > 0) {
                        result.modified.push({
                            identifier: identifier,
                            differences: attrDiff
                        });
                    } else {
                        result.identical.push({
                            identifier: identifier,
                            data: baseMap[identifier]
                        });
                    }
                } else {
                    result.removed.push({
                        identifier: identifier,
                        data: baseMap[identifier]
                    });
                }
            });

            // Check items only in compare
            Object.keys(compMap).forEach(function (identifier) {
                if (!baseMap.hasOwnProperty(identifier)) {
                    result.added.push({
                        identifier: identifier,
                        data: compMap[identifier]
                    });
                }
            });

            return result;
        },

        /**
         * Generate a summary report object from comparison results.
         * @param {object} attrDiff - Result from compareVersions
         * @param {object} structDiff - Result from compareStructures
         * @returns {object} summary
         */
        generateReport: function (attrDiff, structDiff) {
            return {
                attributes: {
                    totalChanges: attrDiff.added.length + attrDiff.removed.length + attrDiff.modified.length,
                    added: attrDiff.added.length,
                    removed: attrDiff.removed.length,
                    modified: attrDiff.modified.length,
                    identical: attrDiff.identical.length,
                    details: attrDiff
                },
                structure: {
                    totalChanges: structDiff.added.length + structDiff.removed.length + structDiff.modified.length,
                    added: structDiff.added.length,
                    removed: structDiff.removed.length,
                    modified: structDiff.modified.length,
                    identical: structDiff.identical.length,
                    details: structDiff
                }
            };
        },

        // --- Internal helpers ---

        /**
         * Flatten a version object into a key-value map of attributes.
         */
        _flattenAttributes: function (obj) {
            var attrs = {};
            if (!obj) return attrs;

            Object.keys(obj).forEach(function (key) {
                var val = obj[key];
                if (typeof val !== "object" || val === null) {
                    attrs[key] = val;
                } else if (Array.isArray(val)) {
                    attrs[key] = val;
                } else {
                    // Flatten nested objects with dot notation
                    var nested = modelCompare._flattenAttributes(val);
                    Object.keys(nested).forEach(function (nk) {
                        attrs[key + "." + nk] = nested[nk];
                    });
                }
            });
            return attrs;
        },

        /**
         * Build a map of children keyed by their identifier (name or title).
         */
        _buildIdentifierMap: function (children) {
            var map = {};
            children.forEach(function (child) {
                var key = child.identifier || child.name || child.title || child.id || JSON.stringify(child);
                map[key] = child;
            });
            return map;
        },

        /**
         * Get the union of keys from two objects.
         */
        _unionKeys: function (obj1, obj2) {
            var keys = {};
            Object.keys(obj1).forEach(function (k) { keys[k] = true; });
            Object.keys(obj2).forEach(function (k) { keys[k] = true; });
            return Object.keys(keys);
        },

        /**
         * Deep equality check for two values.
         */
        _deepEqual: function (a, b) {
            if (a === b) return true;
            if (a === null || b === null) return false;
            if (typeof a !== typeof b) return false;

            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                for (var i = 0; i < a.length; i++) {
                    if (!modelCompare._deepEqual(a[i], b[i])) return false;
                }
                return true;
            }

            if (typeof a === "object") {
                var keysA = Object.keys(a);
                var keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                for (var j = 0; j < keysA.length; j++) {
                    if (!modelCompare._deepEqual(a[keysA[j]], b[keysA[j]])) return false;
                }
                return true;
            }

            return false;
        }
    };

    return modelCompare;
});