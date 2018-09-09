/*
 * YouTube Geofind v3
 *
 * Performs searches to the YouTube API and updates and modifies the page and embedded Google map.
 *
 * @require youtube-api-v3.js
 * @require jquery
 * @require bootstrap
 * @author mattwright324
 */
let geofind = (function(){
    let module = {};

    /* Object with similar functionality to java.util.Map */
    let Map = function() {
        this.keyVal = {};
    };
    Map.prototype = {
        put : function(key, val) { this.keyVal[key] = val; },
        get: function(key) { return this.keyVal[key]; },
        containsKey: function(key) { return this.keyVal[key] !== undefined; },
        size: function() { return this.keyVal.length; },
        clear: function() { this.keyVal = {}; },
        remove: function(key) { delete this.keyVal[key]; },
        isEmpty: function() { $.isEmptyObject(this.keyVal); },
        getOrDefault: function(key, defaultValue) { if(this.containsKey(key)) { return key; } else { return defaultValue; } },
    };

    /* Wrapper for Bootstrap custom-checkbox */
    let CheckBox = function(id) {
        this.element = $(id+" *");
    };
    CheckBox.prototype = {
        setSelected: function(select) { this.element.prop("checked",select); },
        isSelected: function() {return this.element.is(":checked");}
    };

    /* Wrapper for Boostrap progress-bar */
    let ProgressBar = function(doc_element) {
        this.el = $(doc_element);
        this.el.addClass("progress-bar-striped");
    };
    ProgressBar.prototype = {
        getValue: function() { return this.el.attr("aria-valuenow"); },
        getMaxValue: function() { return this.el.attr("aria-valuemax"); },
        getProgress: function() { return this.getValue() / this.getMaxValue(); },
        getText: function() { return this.el.text(); },
        setValue: function(value) {
            this.el.attr("aria-valuenow", value).css("width", 100*this.getProgress()+"%");
            return this;
        },
        addToValue: function(add) {
            this.setValue(Number(this.getValue()) + add);
            return this;
        },
        setMaxValue: function(value) {
            this.el.attr("aria-valuemax", value);
            this.setValue(this.getValue());
        },
        setAnimated: function(animated) {
            if(animated) {
                this.el.addClass("progress-bar-animated");
            } else {
                this.el.removeClass("progress-bar-animated");
            }
            return this;
        },
        setStatus: function(statusClass) {
            this.el.removeClass("bg-success")
                .removeClass("bg-warning")
                .removeClass("bg-danger")
                .removeClass("bg-info")
                .addClass(statusClass);
            return this;
        },
        setText: function(message) {
            this.el.text(message);
            return this;
        }
    };

    /* Map Controls */
    let map_center = {lat: 40.697, lng: -74.259};
    let map;
    let geocoder;
    let circle;
    let locationMarker;

    /* Channel form control */
    let channel;

    /* Location / Topic form controls */
    let address, radius, keywords, sortBy, timeframe, startDate, endDate, pageLimit;

    /* Advanced search controls */
    let enableAdvancedSearch;
    let progressBar;
    let isCC;
    let isLive;
    let isHD;
    let isEmbedded;
    let isSyndicated;

    /* Shared controls */
    let btnSearch;
    let exportData;

    /* Data management for searching */
    let pageType = "channel";
    let markersList = [];
    let profileIconMap = new Map();
    let profileIconLoadQueue = [];

    /* Build the data request for searching */
    function getRequestData() {
        let request = {};
        if(pageType === "channel") {
            // TODO: Determine if channel_id or channel_name
        } else {
            request.q     = keywords.val();
            request.order = sortBy.find(":selected").val();

            if(locationMarker.showing) {
                let position = this.locationMarker.getPosition();
                request.location        = position.lat() + "," + position.lng();
                request.locationRadius  = circle.getRadius() + "m";
            }
            if(isCC && isCC.isSelected()) {
                request.videoLicense    = "creativeCommon";
            }
            if(isLive && isLive.isSelected()) {
                request.eventType       = "live";
            }
            if(isHD && isHD.isSelected()) {
                request.videoDefinition = "high";
            }
            if(isEmbedded && isEmbedded.isSelected()) {
                request.videoEmbeddable = "true";
            }
            if(isSyndicated && isSyndicated.isSelected()) {
                request.videoSyndicated = "true";
            }
        }
        return request;
    }

    function setupPageControls() {
        if(pageType === "location" || pageType === "topic") {
            $("#dataTable").DataTable();

            enableAdvancedSearch.element.on("change", function() {
                // TODO: Show/hide advanced search options.
            });

            if(pageType === "location") {
                circle.setMap(map);

                locationMarker.setMap(map);
                locationMarker.showing = true;
                locationMarker.addListener("dragend", () => {
                    let center = locationMarker.getPosition();

                    circle.setCenter(center);

                    module.adjustMapToCenter();
                });

                module.adjustMapToCenter();
            }
        } else {

        }
    }

    module.setMapCenter = function(lat, lng) {
        let latlng = new google.maps.LatLng(lat, lng);

        locationMarker.setPosition(latlng);
        circle.setCenter(latlng);
        map.setCenter(latlng);

        module.adjustMapToCenter();
    };

    module.adjustMapToCenter = function() {
        let bounds = new google.maps.LatLngBounds();
        bounds.extend(locationMarker.getPosition());
        bounds.union(circle.getBounds());
        map.fitBounds(bounds);
    };


    module.adjustMapToResults = function() {
        let bounds = new google.maps.LatLngBounds();
        for(let i = 0; i < markersList.length; i++) {
            bounds.extend(markersList[i].getPosition());
        }
        map.fitBounds(bounds);
    };

    /* Initialize page controls on google maps callback */
    module.init = function(map_element) {
        geocoder = new google.maps.Geocoder();
        map = new google.maps.Map(map_element, {
            zoom: 7,
            center: map_center
        });
        circle = new google.maps.Circle({
            center: map.center,
            strokeColor: "#00fff0",
            strokeOpacity: 0.5,
            strokeWeight: 2,
            fillColor: "#00fff0",
            fillOpacity: 0.15,
            radius: 10000
        });
        locationMarker = new google.maps.Marker({
            position: map.center,
            draggable: true,
            icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
            title: "Drag me!",
            optimized: false,
            zIndex: 99999999,
            showing: false
        });
        markersList.push(locationMarker);

        channel = $("#channelInput");

        address = $("#address");
        radius = $("#distance");
        keywords = $("#q");
        sortBy = $("#order-by");
        timeframe = $("#time-frame");
        startDate = $("#publishedAfter");
        endDate = $("#publishedBefore");
        pageLimit = $("#page-limit");

        enableAdvancedSearch = new CheckBox("#openAdvanced");
        isCC = new CheckBox("#creative-commons");
        isLive = new CheckBox("#live-only");
        isHD = new CheckBox("#hd-only");
        isEmbedded = new CheckBox("#embedded-only");
        isSyndicated = new CheckBox("#syndicated-only");
        progressBar = new ProgressBar("#videoProg");

        btnSearch = $("#btnFind");
        exportData = $("#btnSaveAll");

        setupPageControls();
    };

    /* Set pageType used in setupPageControls() and called before init() */
    module.setPageToChannel = function() { pageType = "channel"; };
    module.setPageToTopic = function() { pageType = "topic"; };
    module.setPageToLocation = function() { pageType = "location"; };

    /* Initiates search */
    module.search = function() {
        // TODO: Search functionality.
    };

    return module;
}());

function initMap() {
    geofind.init(document.getElementById("map"));
}