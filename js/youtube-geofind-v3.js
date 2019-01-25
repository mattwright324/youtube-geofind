/*
 * YouTube Geofind v3
 *
 * Performs searches to the YouTube API and updates and modifies the page and embedded Google map.
 *
 * @requires youtube-api-v3.js
 * @requires jquery.js
 * @requires bootstrap.js
 * @author mattwright324
 */
let geofind = (function (listener){
    let module = {};

    /* Source: https://stackoverflow.com/a/44376705/2650847 */
    Array.prototype.unique = function() {
        return Array.from(new Set(this)).filter(val => val !== undefined);
    };

    String.prototype.trunc = function(length) {
      return this.length > length ? this.substring(0, length) + "..." : this;
    };

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
            ["bg-primary", "bg-secondary", "bg-success", "bg-danger",
                "bg-warning", "bg-info", "bg-light", "bg-dark"].forEach(className => this.el.removeClass(className));
            this.el.addClass(statusClass);
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
    let loading;
    let loadingPage;

    /* Channel form control */
    let channels;
    let exampleChannel;
    let channelList;

    /* Location / Topic form controls */
    let address, radius, keywords, sortBy, timeframe, startDate, endDate, pageLimit;
    let customRangeDiv;
    let timeRangeMap = new Map(/*<divId,timeInMillis>*/);
    let hour = 60 * 60 * 1000;
    timeRangeMap.put("hour-1",  hour);
    timeRangeMap.put("hour-3",  hour * 3);
    timeRangeMap.put("hour-6",  hour * 6);
    timeRangeMap.put("hour-12", hour * 12);
    timeRangeMap.put("hour-24", hour * 24);
    timeRangeMap.put("day-7",   hour * 24 * 7);
    timeRangeMap.put("day-30",  hour * 24 * 30);
    timeRangeMap.put("day-365", hour * 24 * 365);

    /* Advanced search controls */
    let advancedToggle;
    let showAdvForm = false;
    let advancedForm;
    let progressBar;
    let isCC;
    let isLive;
    let isHD;
    let isEmbedded;
    let isSyndicated;

    /* Shared controls */
    let btnSearch;
    let exportData;
    let dataTable;

    /* Data management for searching */
    let pageType = "channel";
    let markersList = [];
    let profileIconMap = new Map(/*<channelId,profileURL>*/);

    /* Build the data request for topic and location searching */
    function getRequestData() {
        let request = {};
        request.q     = keywords.val();
        request.order = sortBy.find(":selected").val();

        if(locationMarker.showing) {
            let position = locationMarker.getPosition();
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

        let time = timeframe.find(":selected").val();
        if(time !== "any") {
            let beforeDate = new Date();
            let afterDate = new Date(beforeDate);

            console.log(beforeDate);
            console.log(afterDate);
            console.log(time);

            if(time === "custom") {
                beforeDate = new Date(document.getElementById("publishedBefore").value);
                afterDate = new Date(document.getElementById("publishedAfter").value);
            } else {
                afterDate.setTime(beforeDate.getTime() - timeRangeMap.get(time));
            }

            request.publishedBefore = beforeDate.toJSON();
            request.publishedAfter  = afterDate.toJSON();
        }

        return request;
    }

    function setupPageControls() {
        console.log("Setting up page controls for: "+pageType);
        if(pageType === "location" || pageType === "topic") {
            dataTable = $("#dataTable").DataTable();

            if(isCC.isSelected() || isLive.isSelected() || isEmbedded.isSelected() || isSyndicated.isSelected() || isHD.isSelected()) {
                advancedToggle.click();
            }

            timeframe.change(function() {
                let val = timeframe.find(":selected").val();
                if(val === "custom") {
                    customRangeDiv.show();
                } else {
                    customRangeDiv.hide();
                }
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

                address.on("keyup", function(event) {
                   if(event.keyCode === 13) { geocode(address.val()); }
                });

                radius.change(function() {
                   let r = radius.find(":selected").val() * 1000;

                   circle.setRadius(r);

                   module.adjustMapToCenter();
                });

                module.adjustMapToCenter();

                reverseGeocode();
            }
        } else {
            channels.keyup(function(event) {
                if (event.keyCode === 13) {
                    $("#btnFind").click();
                }
            });
        }
    }

    /* Parses videoIds for geo-tags and invokes callback */
    function parseVideos(videoIds, callback) {
        youtube.ajax("videos", {
            id: videoIds.join(","),
            maxResults: 50,
            part: "snippet,recordingDetails"
        }).done(function(res) {
            callback(res);
        }).fail(function(err) {
            console.error(err);
            displayAlert("warning", "An error occured:", err.responseText);
            loading.fadeOut(1000);
        });
    }

    /* Recursive search for topic and location */
    function search(data, status) {
        youtube.ajax("search", data).done(function(res) {
            loadingPage.text("Pg " + status.page);

            let videoIds = [];
            res.items.forEach(item => videoIds.push(item.id.videoId));

            console.log("Checking videos: "+videoIds);
            parseVideos(videoIds, (res2) => {
                res2.items.forEach(item => {
                    if(item.hasOwnProperty("recordingDetails") && item.recordingDetails.hasOwnProperty("location")) {
                        let location = item.recordingDetails.location;
                        if(location.hasOwnProperty("longitude") && location.hasOwnProperty("latitude")) {
                            let id        = item.id;
                            let thumbUrl  = item.snippet.thumbnails.default.url;
                            let desc      = item.snippet.description.trunc(50);
                            let title     = item.snippet.title.trunc(65);
                            let author    = item.snippet.channelTitle.trunc(65);
                            let channelId = item.snippet.channelId;
                            let published = item.snippet.publishedAt;
                            let lat       = location.latitude;
                            let long      = location.longitude;

                            let markerContent =
`<div class="marker" align="center">
    <img src="${thumbUrl}" />
    <table class="table table-sm">
        <tr><td colspan="2"><a target="_blank" href="https://youtu.be/${id}">${title}</a></td></tr>
        <tr><td style="width:15%">Author</td>       <td>${author}</td></tr>
        <tr><td>Description</td>  <td>${desc}</td></tr>
        <tr><td>Published</td>    <td>${published}</td></tr>
        <tr><td>Lat,Long</td>     <td>${lat},${long}</td></tr>
    </table>
</div>`;
                            let tableContent =
`<tr>
    <td>
        <div class="table-item d-flex flex-row justify-content-start">
            <img src="${thumbUrl}" />
            <table class="table" style="margin-left:15px">
                <tr><td colspan="2"><a target="_blank" href="https://youtu.be/${id}">${title}</a></td></tr>
                <tr><td style="width:25%">Author</td>       <td>${author}</td></tr>
                <tr><td>Description</td>  <td>${desc}</td></tr>
                <tr><td>Published</td>    <td>${published}</td></tr>
            </table>
        </div>
    </td>
</tr>`;

                            let markerPopup = new google.maps.InfoWindow({content: markerContent});
                            let marker = new google.maps.Marker({
                                position: {lat: lat, lng: long},
                                map: map,
                                videoId: id,
                                publishedAt: published,
                                channelTitle: author,
                                videoTitle: title,
                                videoDesc: item.snippet.description,
                                channelId: channelId,
                                thumbLoaded: false
                            });
                            markersList.push(marker);
                            marker.addListener("click", () => {
                                markerPopup.open(map, marker);
                            });
                            module.adjustMapToResults();

                            dataTable.row.add([tableContent]).draw();

                            exportData.prop("disabled", false);
                            exportData.removeClass("btn-secondary").addClass("btn-warning");
                        }
                    }
                });

                loadProfileIcons();

                if(res.hasOwnProperty("nextPageToken") && status.page < status.pageLimit) {
                    status.page++;
                    data.pageToken = res.nextPageToken;

                    search(data, status);
                } else {
                    loading.fadeOut(1000);
                }
            });
        }).fail(function(err) {
            console.error(err);
            displayAlert("warning", "An error occured:", err.responseText);
        });
    }

    /* Search for channels; get channel data and pass to parsePlaylist() */
    function searchChannel(data) { // UCv_A5v7v24p5aq1G5oJzDPA,UC8P2G00nUMdDnjR04Q9nbyQ
        youtube.ajax("channels", data).done(function(res) {
            let channel = res.items[0];
            if(channel) {
                console.log(channel);
                let channelId   = channel.id;
                let channelUrl  = "https://www.youtube.com/channel/" + channelId;
                let thumbUrl    = channel.snippet.thumbnails.default.url;
                let author      = channel.snippet.title;
                let uploads     = channel.contentDetails.relatedPlaylists.uploads;

                let html = $("#"+channelId);

                if(!html.length) {
                    html = $(`
<li id="${channelId}" class="list-group-item d-flex flex-row channel" data-tags="0">
    <a target="_blank" href="${channelUrl}" style="margin-right: 15px">
        <img width=64px height=64px src="${thumbUrl}" class="thumb" />
    </a>
    <div class="d-flex flex-column" align="left" style="width:75%">
        <h5 class="channel-name">${author}</h5>
        <label class="channel-tags">0 videos geo-tagged</label>
    </div>
    <div class="d-flex flex-column" align="center" style="width:25%">
        <div class="progress progress-bar progress-bar-striped" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
        <button type="button" class="btn btn-secondary" id="btnSave" onclick="geofind.exportToCSV('${channelId}')" disabled>Export CSV <i class="fa fa-download" aria-hidden="true"></i></button>
    </div>
</li>
`);
                    channelList.append(html);
                }

                exampleChannel.remove();



                let request = {
                    part:       "snippet",
                    maxResults:  50,
                    playlistId:  uploads,
                    pageToken:   ""
                };
                parsePlaylist(request, {
                    page: 0,
                    parsedResults: 0,
                    totalResults: 0,
                    tags: 0,
                    tags_el: html.find(".channel-tags"),
                    progress: new ProgressBar(html.find(".progress")),
                    btnSave: html.find(".btn"),
                    html: html
                });
            } else {
                let input = data.id ? data.id : data.forUsername;
                displayAlert("warning", input, "Channel not found.");
                loading.hide();
            }
        }).fail(function(err) {
            console.error(err);
            displayAlert("warning", "An error occured:", err.responseText);
            loading.hide();
        });
    }

    /* Parse playlistId for channel searching */
    function parsePlaylist(data, status) {
        status.progress.setText(status.parsedResults + " / " + status.totalResults);
        youtube.ajax("playlistItems", data).done(function(res){
            if(data.pageToken === "") { status.totalResults = res.pageInfo.totalResults; }

            let videoIds = [];
            res.items.forEach(item => videoIds.push(item.snippet.resourceId.videoId));

            console.log("Checking videos: "+videoIds);

            parseVideos(videoIds, function(res2) {
                status.parsedResults += res.items.length;

                status.progress.setText(status.parsedResults + " / " + status.totalResults);
                status.progress.setAnimated(true).setValue(100).setStatus("bg-primary")
                    .setText(status.parsedResults + " / " + status.totalResults);

                res2.items.forEach(item => {
                    if(item.hasOwnProperty("recordingDetails") && item.recordingDetails.hasOwnProperty("location")) {
                        let location = item.recordingDetails.location;
                        if(location.hasOwnProperty("longitude") && location.hasOwnProperty("latitude") && !markerExists(item.id)) {
                            let id        = item.id;
                            let thumbUrl  = item.snippet.thumbnails.default.url;
                            let desc      = item.snippet.description.trunc(50);
                            let title     = item.snippet.title.trunc(65);
                            let author    = item.snippet.channelTitle.trunc(65);
                            let channelId = item.snippet.channelId;
                            let published = item.snippet.publishedAt;
                            let lat       = location.latitude;
                            let long      = location.longitude;

                            let markerContent =
                                `<div class="marker" align="center">
    <image src="${thumbUrl}" width=120px height=90px />
    <table class="table table-sm">
        <tr><td colspan="2"><a target="_blank" href="https://youtu.be/${id}">${title}</a></td></tr>
        <tr><td style="width:15%">Author</td>       <td>${author}</td></tr>
        <tr><td>Description</td>  <td>${desc}</td></tr>
        <tr><td>Published</td>    <td>${published}</td></tr>
        <tr><td>Lat,Long</td>     <td>${lat},${long}</td></tr>
    </table>
</div>`;

                            let markerPopup = new google.maps.InfoWindow({content: markerContent});
                            let marker = new google.maps.Marker({
                                position: {lat: lat, lng: long},
                                map: map,
                                videoId: id,
                                publishedAt: published,
                                channelTitle: item.snippet.channelTitle,
                                videoTitle: item.snippet.title,
                                videoDesc: item.snippet.description,
                                channelId: channelId,
                                thumbLoaded: false
                            });
                            markersList.push(marker);
                            marker.addListener("click", () => {
                                markerPopup.open(map, marker);
                            });
                            module.adjustMapToResults();

                            loadingPage.text((markersList.length - 1) + " videos");
                            status.tags++;
                            status.tags_el.text(status.tags + " videos geo-tagged");
                            status.btnSave.prop("disabled", false);
                            status.btnSave.removeClass("btn-secondary").addClass("btn-warning");
                            status.html.attr("data-tags", status.tags);

                            exportData.prop("disabled", false);
                            exportData.removeClass("btn-secondary").addClass("btn-warning");
                        }
                    }
                });

                loadProfileIcons();

                if(res.hasOwnProperty("nextPageToken")) {
                    data.pageToken = res.nextPageToken;
                    data.page++;

                    parsePlaylist(data, status);
                } else {
                    loading.hide();
                    status.progress.setAnimated(false).setStatus(status.tags === 0 ? "bg-secondary" : "bg-success");
                }
            });
        }).fail(function(err){
            console.error(err);
            status.progress.setAnimated(false).setStatus("bg-danger");
            displayAlert("warning", "An error occured:", err.responseText);
            loading.hide();
        });
    }

    /* Calculate time until the api quota resets (midnight pst) for display */
    function timeUntilQuotaReset() {
        let now = new Date(new Date().toLocaleString([],{timeZone: "America/Los_Angeles"}));
        let midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        let diff = midnight - now;
        let s = diff / 1000;
        let m = s / 60;
        let h = m / 60;
        s = Math.floor(s % 60);
        m = Math.floor(m % 60);
        h = Math.floor(h);
        return {h: h, m: m};
    }

    function markerExists(videoId) {
        for(let i=0; i<markersList.length; i++) {
            if(markersList[i].videoId === videoId) {
                return true;
            }
        }
        return false;
    }

    /* Obtains address from coordinates of locationMarker, set's to address field value */
    function reverseGeocode(callback) {
        let pos = locationMarker.getPosition();
        geocoder.geocode({"location": pos}, (res, stat) => {
            if(stat === "OK") {
                if(res[0]) {
                    address.attr("value", res[0].formatted_address);
                } else {
                    address.attr("value", pos.lat()+","+pos.lng());
                }

                if(callback) {
                    callback.call();
                }
            }
        });
    }

    /* Converts from given address to coordinates, set's locationMarker to position */
    function geocode(address, callback) {
        geocoder.geocode({address: address}, (res, stat) => {
            if(stat === "OK") {
                if(res[0]) {
                    let results = res[0];
                    let latlng = results.geometry.location;

                    locationMarker.setPosition(latlng);
                    circle.setCenter(locationMarker.getPosition());

                    module.adjustMapToCenter();

                    if(callback) {
                        callback.call();
                    }
                }
            }
        });
    }

    // Source: https://stackoverflow.com/a/13419367/2650847
    function parseQuery(queryString) {
        let query = {};
        let pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
        for (let i = 0; i < pairs.length; i++) {
            let pair = pairs[i].split('=');
            query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
        }
        return query;
    }

    function loadFromURL() {
        let query = window.location.search;
        let queryParams = parseQuery(query);
        let regexIsTrue = new RegExp("t(rue)?", "i");

        let doSearch = regexIsTrue.test(queryParams["doSearch"]);

        if(regexIsTrue.test(queryParams["live"])) {
            isLive.setSelected(true);

            if(!showAdvForm) advancedToggle.click();
        }
        if(regexIsTrue.test(queryParams["creativeCommons"])) {
            isCC.setSelected(true);

            if(!showAdvForm) advancedToggle.click();
        }
        if(regexIsTrue.test(queryParams["hd"])) {
            isHD.setSelected(true);

            if(!showAdvForm) advancedToggle.click();
        }
        if(regexIsTrue.test(queryParams["embeddable"])) {
            isEmbedded.setSelected(true);

            if(!showAdvForm) advancedToggle.click();
        }
        if(regexIsTrue.test(queryParams["syndicated"])) {
            isSyndicated.setSelected(true);

            if(!showAdvForm) advancedToggle.click();
        }
        if(queryParams["timeframe"]) {
            let value = queryParams["timeframe"];

            timeframe.val(value);
            timeframe.trigger("change");

            if(value === 'custom') {
                if(queryParams["start"]) {
                    startDate.val(queryParams["start"]);
                }
                if(queryParams["end"]) {
                    endDate.val(queryParams["end"]);
                }
            }
        }
        if(queryParams["radius"]) {
            let value = queryParams["radius"];

            radius.val(value);
            radius.trigger("change");
        }
        if(queryParams["keywords"]) {
            keywords.val(queryParams["keywords"])
        }
        if(queryParams["sort"]) {
            let value = queryParams["sort"];

            sortBy.val(value);
            sortBy.trigger("change");
        }
        if(queryParams["pages"]) {
            let value = queryParams["pages"];

            pageLimit.val(value);
            pageLimit.trigger("change");
        }

        if(queryParams["locationAddress"]) {
            let value = queryParams["locationAddress"];

            geocode(value, () => {
                if(doSearch) {
                    btnSearch.click();
                }
            });
        } else if(queryParams["location"]) {
            let value = queryParams["location"];

            console.log(value);

            if(value.includes(",")) {
                let parts = value.split(",");

                let latlng = new google.maps.LatLng(parts[0], parts[1]);

                module.setMapCenter(latlng.lat(), latlng.lng());

                reverseGeocode(() => {
                    if(doSearch) {
                        btnSearch.click();
                    }
                });
            }
        } else if(doSearch) {
            setTimeout(() => {btnSearch.click();}, 500);
        }
    }

    /* Loads existing icons to markers and fetches new icons */
    function loadProfileIcons() {
        let unloaded = markersList.filter(marker => !marker.thumbLoaded);

        let fetched = unloaded.filter(marker => profileIconMap.containsKey(marker.channelId));
        if(fetched.length > 0) {
            console.log("Loading " + fetched.length + " marker icons");
            fetched.forEach(marker => {
                let icon = {
                    url: profileIconMap.get(marker.channelId),
                    scaledSize: new google.maps.Size(20, 20),
                    origin: new google.maps.Point(0,0),
                    anchor: new google.maps.Point(0,0)
                };
                marker.setIcon(icon);
                marker.thumbLoaded = true;
            });
        }

        let fetch = unloaded.filter(marker => !profileIconMap.containsKey(marker.channelId));
        let fetchIds = fetch.map(marker => marker.channelId).unique();

        if(fetchIds.length > 0) {
            console.log("Fetching " + fetchIds.length + " new profile icons ["+fetchIds.join(",")+"]");
            youtube.ajax("channels", {
                part: "snippet",
                id: fetchIds.join(",")
            }).done((res) => {
                res.items.forEach(item => {
                    profileIconMap.put(item.id, item.snippet.thumbnails.default.url);
                });
                loadProfileIcons();
            });
        }
    }

    function displayAlert(level, title, message) {
        let errorContent = `
<div class="alert alert-${level} alert-dismissible fade show" role="alert">
    <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
    </button>
    <strong>${title}</strong>
    ${message}
</div>`;
        $("#alerts").before(errorContent);
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

    module.geolocate = function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) =>{
                module.setMapCenter(pos.coords.latitude, pos.coords.longitude);
            });
        }
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
        locationMarker.addListener("dragend", () => {
            loading.show();

            circle.setCenter(locationMarker.getPosition());
            reverseGeocode();

            loading.hide();
        });
        markersList.push(locationMarker);
        loading        = $("#loading");
        loadingPage    = $("#loading-page");

        channels       = $("#channelList");
        channelList    = $("#channel-list");
        exampleChannel = channelList.find(".example");

        address        = $("#address");
        radius         = $("#distance");
        keywords       = $("#q");
        sortBy         = $("#order-by");
        timeframe      = $("#time-frame");
        customRangeDiv = $("#custom-range");
        startDate      = $("#publishedAfter");
        endDate        = $("#publishedBefore");
        pageLimit      = $("#page-limit");

        advancedToggle = $("#toggle");
        advancedForm   = $("#advanced-form");
        advancedForm.slideUp(0);
        isCC    = new CheckBox("#creative-commons");
        isLive  = new CheckBox("#live-only");
        isHD    = new CheckBox("#hd-only");
        isEmbedded   = new CheckBox("#embedded-only");
        isSyndicated = new CheckBox("#syndicated-only");
        progressBar  = new ProgressBar("#videoProg");

        btnSearch  = $("#btnFind");
        exportData = $("#btnSaveAll");

        setupPageControls();

        loading.fadeOut(1000);

        loadFromURL();
    };

    /* Set pageType used in setupPageControls() and called before init() */
    module.setPageToChannel = function() { pageType = "channel"; console.log("Set page type: "+pageType); };
    module.setPageToTopic = function() { pageType = "topic"; console.log("Set page type: "+pageType); };
    module.setPageToLocation = function() { pageType = "location"; console.log("Set page type: "+pageType); };
    module.toggleAdvancedOptions = function() {
        showAdvForm = !showAdvForm;
        if(showAdvForm) {
            advancedForm.slideDown(250);
        } else {
            advancedForm.slideUp(250);
        }
    };

    /* Initiates search */
    module.search = function() {
        loading.show();

        let request = getRequestData();
        request.part       = "id";
        request.maxResults = 50;
        request.type       = "video";
        request.pageToken  = "";

        let status = {
            page: 1,
            pageLimit: pageLimit.find(":selected").val()
        };

        search(request, status);
    };
    module.channelSearch = function() {
        loading.show();

        console.log("Performing channel search");

        let values = channels.val().split(",");
        values.forEach(value => {
            value = value.trim();

            let request = {};
            if(value.length === 24) {
                console.log("Trying channel_id: "+value);
                request.id = value;
            } else if(value.length <= 20) {
                console.log("Trying channel_name: "+value);
                request.forUsername = value;
            } else {
                console.log("Invalid input: "+value);
                displayAlert("warning", "Invalid Input:", value);
            }
            if(request !== {}) {
                request.part = "snippet,contentDetails";
                searchChannel(request);
            } else {
                loading.hide();
            }
        });
    };
    module.exportToCSV = function(channel_id) {
        let filename = "geotags_all";
        if(channel_id != undefined) { filename = channel_id; }
        let content = "data:text/csv;charset=utf-8,channel_id\tvideo_id\tlatitude\tlongitude\tpublished\tchannel_title\tvideo_title\tvideo_desc\n";
        let lineArray = [];
        markersList.filter(m => m !== locationMarker).forEach(m => {
            if(channel_id === undefined || m.channelId === channel_id) {
                lineArray.push([m.channelId, m.videoId, m.getPosition().lat(), m.getPosition().lng(), m.publishedAt, m.channelTitle, m.videoTitle, encodeURI(m.videoDesc)].join("\t"));
            }
        });
        content += lineArray.join("\n");

        let encodedURI = encodeURI(content);
        let a = document.createElement("a");
        a.setAttribute("href", encodedURI);
        a.setAttribute("download", filename+".txt");
        document.body.appendChild(a);
        a.click();
    };

    return module;
}());

function initMap() {
    geofind.init(document.getElementById("map"));
}