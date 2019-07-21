/**
 * YouTube Geofind v4
 *
 * @requires youtube-api-v3.js
 * @requires jquery
 * @requires datatables
 * @author mattwright324
 */
const geofind = (function() {

    String.prototype.trunc = function(length) {
        return this.length > length ? this.substring(0, length) + "..." : this;
    };

    const hour = 60 * 60 * 1000;
    const day = hour * 24;

    const defaults = {
        animationMs: 250,

        // Coords are centered near New York, completely arbitrary.
        mapCenterCoords: {
            lat: 40.697,
            lng: -74.259
        },

        mapMarkerWidth: 20,

        time: {
            "hour-1":  hour,
            "hour-3":  hour * 3,
            "hour-6":  hour * 6,
            "hour-12": hour * 12,
            "hour-24": day,
            "day-7":   day * 7,
            "day-30":  day * 30,
            "day-90":  day * 90,
            "day-365": day * 365
        }
    };
    const pageTypes  = {
        UNDEFINED: "undefined",
        CHANNEL: "channel",
        TOPIC: "topic",
        LOCATION: "location"
    };
    const controls = {};
    const elements = {};

    const ProgressBar = function(element) {
        this.element = $(element);
        this.textDisplay = true;
    };
    ProgressBar.prototype = {
        getElement() {
            return this.element;
        },

        setRange(min, max) {
            this.setMin(min);
            this.setMax(max);
        },
        getMin() {
            return this.element.attr("aria-valuemin");
        },
        setMin(min) {
            this.element.attr("aria-valuemin", min);
            this.update();
        },
        getMax() {
            return this.element.attr("aria-valuemax");
        },
        setMax(max) {
            this.element.attr("aria-valuemax", max);
            this.update();
        },
        getValue() {
            return this.element.attr("aria-valuenow");
        },
        setValue(number) {
            this.element.attr("aria-valuenow", number);
            this.update();
        },
        incrementValue(number) {
            const incrValue = number ? number : 1;

            this.setValue(this.getValue() + incrValue);
        },
        animated(bool) {
            if(bool) {
                this.element.addClass("progress-bar-animated");
            } else {
                this.element.removeClass("progress-bar-animated");
            }
        },
        striped(bool) {
            if(bool) {
                this.element.addClass("progress-bar-striped");
            } else {
                this.element.removeClass("progress-bar-striped");
            }
        },
        showText(bool) {
            this.textDisplay = false;
            this.update();
        },
        setBg(bgValue) {
            this.element.alterClass("bg-*", bgValue);
        },


        update() {
            const min = this.getMin();
            const max = this.getMax();
            const value = this.getValue();
            const percentage = 100 * ((value-min) / (max-min));

            this.element.css("width", percentage + "%");

            if(this.textDisplay) {
                this.element.text(value + " / " + max)
            }
        }
    };

    const internal = {
        /**
         * This should only be called once.
         */
        init: function(mapElement) {
            internal.map = new google.maps.Map(mapElement, {
                zoom: 7,
                center: defaults.mapCenterCoords
            });
            internal.geocoder = new google.maps.Geocoder();

            setTimeout(function() {
                var event = document.createEvent('UIEvents');
                event.initUIEvent('zoom_changed',
                    true, false,
                    window, 0);
                window.dispatchEvent(event);
            }, 200);

            controls.mapRadius = new google.maps.Circle({
                center: internal.map.center,
                strokeColor: "#00fff0",
                strokeOpacity: 0.5,
                strokeWeight: 2,
                fillColor: "#00fff0",
                fillOpacity: 0.15,
                radius: 10000
            });
            controls.mapLocationMarker = new google.maps.Marker({
                position: internal.map.center,
                draggable: true,
                icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                title: "Drag me!",
                optimized: false,
                zIndex: 99999999,
                showing: false
            });

            elements.loadingDiv     = $("#loading");
            elements.loadingText    = $("#loading-page");

            elements.alerts         = $("#alerts");

            controls.inputChannels  = $("#channels");
            elements.channelsDiv    = $("#channel-list");
            elements.channelPlaceholder = $(".example");

            controls.inputAddress   = $("#address");
            controls.btnGeolocate   = $("#geolocate");
            controls.comboRadius    = $("#radius");
            controls.inputKeywords  = $("#keywords");
            controls.comboSortBy    = $("#sortBy");
            controls.comboTimeframe = $("#timeframe");
            elements.customRangeDiv = $("#customRange");
            controls.inputDateFrom  = $("#dateFrom");
            controls.inputDateTo    = $("#dateTo");
            controls.comboPageLimit = $("#pageLimit");

            controls.btnToggleAdvanced = $("#btnToggleAdvanced");
            elements.advancedDiv       = $("#advanced-form");
            controls.checkLive         = $("#liveOnly");
            controls.checkCC           = $("#creativeCommons");
            controls.checkHQ           = $("#highQuality");
            controls.checkEmbedded     = $("#embeddedOnly");
            controls.checkSyndicated   = $("#syndicatedOnly");

            controls.checkClearResults = $("#clearOnSearch");

            elements.videoDataTable    = $("#dataTable").DataTable({
                "order": [[0, "asc"]],
                "columnDefs": [
                    {
                        "targets": [0],
                        "visible": false,
                        "searchable": false
                    }
                ]
            });

            controls.btnExport = $("#btnExportAll");
            controls.btnSubmit = $("#btnSubmit");

            if(controls.inputChannels.length) {
                this.pageType = pageTypes.CHANNEL;
            } else if(controls.inputAddress.length) {
                this.pageType = pageTypes.LOCATION;
            } else if(controls.inputKeywords.length) {
                this.pageType = pageTypes.TOPIC;
            } else {
                console.error("Could not determine the page type, expected page elements do not exist.");
            }

            console.log("Determined page type was [type="+this.pageType+"]");

            this.setupPageControls();

            module.params.updatePageFromAll();

            elements.loadingDiv.fadeOut(defaults.animationMs);
        },
        pageType: 'undefined',
        markersList: [],
        channelThumbs: {},


        setupPageControls: function() {
            const KEY_ENTER = 13;

            internal.startChannelConsumer();

            if(this.pageType === pageTypes.CHANNEL) {
                controls.inputChannels.keyup(function(event) {
                    if (event.keyCode === KEY_ENTER) {
                        $("#btnFind").click();
                    }
                });

                controls.btnSubmit.on('click', function() {
                    const channels = controls.inputChannels.val()
                        .replace(/\s/g, "")
                        .split(",");

                    console.log(channels);

                    let payload;

                    for(let i=0; i<channels.length; i++) {
                        const channelStr = channels[i].trim();

                        if(channelStr) {
                            if(channelStr.length === 24) {
                                payload = {id: channelStr};
                            } else if(channelStr.length <= 20) {
                                payload = {forUsername: channelStr};
                            }

                            console.log(payload);

                            elements.loadingDiv.show();

                            if(payload) {
                                query.channels(payload, function(res) {
                                    const channel = res.items[0];

                                    if(channel) {
                                        // Does not exist in page yet
                                        if(!$("#"+channel.id).length) {
                                            const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

                                            const channelListHtml = format.channelToListItemHtml(channel);

                                            elements.channelPlaceholder.remove();
                                            elements.channelsDiv.append(channelListHtml);

                                            elements[channel.id] = {};
                                            elements[channel.id].progress = new ProgressBar("#"+channel.id+" .progress-bar");
                                            elements[channel.id].tagCount = $("#"+channel.id+" .tag-count");

                                            controls[channel.id] = {};
                                            controls[channel.id].btnExport = $("#"+channel.id+" .btn-save");

                                            let videoTotal = 0;

                                            function searchPlaylist(pageToken) {
                                                youtube.ajax("playlistItems", {
                                                    part: "snippet",
                                                    maxResults: 50,
                                                    playlistId: uploadsPlaylistId,
                                                    pageToken: pageToken
                                                }).done(function(res) {
                                                    console.log("Searching [playlistId="+uploadsPlaylistId+", pageToken="+pageToken+", totalVideos="+videoTotal+"]");

                                                    if(pageToken === "") {
                                                        elements[channel.id].progress.setRange(0, res.pageInfo.totalResults);
                                                    }

                                                    videoTotal += res.items.length;

                                                    elements[channel.id].progress.setValue(videoTotal);

                                                    const videoIds = [];
                                                    for(let i=0; i<res.items.length; i++) {
                                                        const playlistVideo = res.items[i];

                                                        videoIds.push(playlistVideo.snippet.resourceId.videoId);
                                                    }

                                                    console.log(videoIds);

                                                    query.videos(videoIds, function(res) {
                                                        console.log(res);

                                                        for(let i=0; i<res.items.length; i++) {
                                                            const video = res.items[i];

                                                            internal.pushVideo(video, true, true);
                                                        }
                                                    });

                                                    if(internal.markersList.length > 0) {
                                                        internal.adjustMapToResults();
                                                    }

                                                    if(res.hasOwnProperty("nextPageToken")) {
                                                        searchPlaylist(res.nextPageToken);
                                                    } else {
                                                        elements.loadingDiv.fadeOut(defaults.animationMs);
                                                        elements[channel.id].progress.animated(false);
                                                    }
                                                }).fail(function(err) {
                                                    elements[channel.id].progress.setBg("bg-danger");

                                                    internal.displayMessage("alert-warning", JSON.stringify(err));

                                                    console.error(err);
                                                })
                                            }

                                            searchPlaylist("");
                                        } else {
                                            console.warn("Channel was already in the list '"+channel.id+"'");
                                        }
                                    } else {
                                        internal.displayMessage("alert-warning", "Channel does not exist '"+channelStr+"'");
                                    }
                                });
                            } else {
                                internal.displayMessage("alert-warning", "Did not recognize value as id or username '"+channelStr+"'");

                                console.error("Channel value didn't match expected lengths.");
                            }
                        } else {
                            console.error("Channel value was empty.");
                        }
                    }

                    elements.loadingDiv.fadeOut(defaults.animationMs);
                })
            } else {
                if(this.pageType === pageTypes.LOCATION) {
                    controls.mapLocationMarker.setMap(this.map);
                    controls.mapRadius.setMap(this.map);

                    // Move radius circle and map to drop location.
                    controls.mapLocationMarker.addListener("dragend", () => {
                        const center = controls.mapLocationMarker.getPosition();

                        controls.mapRadius.setCenter(center);

                        internal.adjustMapToCenter();
                    });

                    // Geocode address on pressing Enter in address textfield
                    controls.inputAddress.on("keyup", function(event) {
                        if(event.keyCode === KEY_ENTER) {
                            internal.geocode(controls.inputAddress.val());
                        }
                    });

                    // When radius selection changes, adjust zoom on map.
                    controls.comboRadius.change(function() {
                        const radiusInMeters = controls.comboRadius.find(":selected").val() * 1000;

                        controls.mapRadius.setRadius(radiusInMeters);

                        internal.adjustMapToCenter();
                    });

                    internal.reverseGeocode(internal.map.getCenter());
                    internal.adjustMapToCenter();
                }

                controls.comboTimeframe.change(function() {
                    const value = controls.comboTimeframe.find(":selected").val();

                    if(value === "custom") {
                        elements.customRangeDiv.show();
                    } else {
                        elements.customRangeDiv.hide();
                    }
                });

                function getFormattedDate(date) {
                    const year = date.getFullYear();

                    let month = (1 + date.getMonth()).toString();
                    month = month.length > 1 ? month : '0' + month;

                    let day = date.getDate().toString();
                    day = day.length > 1 ? day : '0' + day;

                    return year + "-" + month + '-' + day;
                }

                controls.inputDateTo.val(getFormattedDate(new Date()));

                controls.btnToggleAdvanced.on('click', function() {
                    if(elements.advancedDiv.is(":visible")) {
                        elements.advancedDiv.slideUp(defaults.animationMs);
                    } else {
                        elements.advancedDiv.slideDown(defaults.animationMs);
                    }
                });

                controls.btnSubmit.on('click', function() {
                    if(controls.checkClearResults.is(":checked")) {
                        module.clearResults();
                    }

                    const maxPages = controls.comboPageLimit.find(":selected").val();

                    let pageValue = 0;

                    elements.loadingDiv.show();

                    function search(pageToken) {
                        console.log("Searching [pageValue="+pageValue+", maxPages="+maxPages+", pageToken="+pageToken+"]");

                        elements.loadingText.text("Pg " + (pageValue + 1));

                        youtube.ajax("search", internal.getRequestPayload(pageToken)).done((res) => {
                            console.log(res);

                            const videoIds = [];
                            for(let i=0; i<res.items.length; i++) {
                                const searchItemVideo = res.items[i];

                                videoIds.push(searchItemVideo.id.videoId);
                            }

                            console.log(videoIds);

                            query.videos(videoIds, function(res) {
                                console.log(res);

                                for(let i=0; i<res.items.length; i++) {
                                    const video = res.items[i];

                                    if(!internal.doesVideoExistYet(video.id)) {
                                        internal.pushVideo(video, true, true);
                                    }
                                }
                            });

                            if(internal.markersList.length > 0) {
                                internal.adjustMapToResults();
                            }

                            pageValue++;

                            if(res.hasOwnProperty("nextPageToken") && pageValue < maxPages) {
                                search(res.nextPageToken);
                            } else {
                                elements.loadingDiv.fadeOut(defaults.animationMs);
                            }
                        }).fail((err) => {
                            pageToken = null;

                            elements.loadingDiv.fadeOut(defaults.animationMs);

                            internal.displayMessage("alert-warning", JSON.stringify(err));

                            console.error(err);
                        });
                    }

                    search("");
                });

                controls.checkClearResults.prop("checked", true);
            }
        },

        /**
         * This returns the payload for topic and location searching.
         *
         * Channel doesn't need this as it will do it's own handling for the request.
         */
        getRequestPayload: function(pageToken) {
            const request = {};

            if(internal.pageType === pageTypes.CHANNEL) {
                console.error("internal.getRequestPayload() shouldn't be called on the channel page")
            } else {
                request.part = "id";
                request.maxResults = 50;
                request.type = "video";
                request.pageToken = pageToken;

                if(internal.pageType === pageTypes.LOCATION) {
                    const position = controls.mapLocationMarker.getPosition();

                    request.location = position.lat() + "," + position.lng();
                    request.locationRadius = controls.comboRadius.val() * 1000 + "m";
                }

                request.q = controls.inputKeywords.val();
                request.order = controls.comboSortBy.find(":selected").val();

                if(controls.checkCC.is(":checked")) {
                    request.videoLicense = "creativecommon"
                }
                if(controls.checkLive.is(":checked")) {
                    request.eventType = "live";
                }
                if(controls.checkHQ.is(":checked")) {
                    request.videoDefinition = "high";
                }
                if(controls.checkEmbedded.is(":checked")) {
                    request.videoEmbeddable = "true";
                }
                if(controls.checkSyndicated.is(":checked")) {
                    request.videoSyndicated = "true";
                }

                const timeVal = controls.comboTimeframe.find(":selected").val();
                if(timeVal !== "any") {
                    let dateFrom = new Date();
                    let dateTo = new Date();

                    if(timeVal === "custom") {
                        dateFrom = new Date(controls.inputDateFrom.val());
                        dateTo = new Date(controls.inputDateTo.val());
                    } else {
                        dateFrom.setTime(dateTo.getTime() - defaults.time[timeVal]);
                    }

                    console.log(dateFrom.toISOString());
                    console.log(dateTo.toISOString());

                    request.publishedAfter = dateFrom.toISOString();
                    request.publishedBefore = dateTo.toISOString();
                }

                console.log(request);
            }

            return request;
        },

        displayMessage: function(type, message) {
            const html =
                "<div class='alert alert-dismissable fade show "+type+"' role='alert'>" +
                    "<button type='button' class='close' data-dismiss='alert' aria-label='Close'><span aria-hidden='true'>×</span></button>" +
                    message +
                "</div>";

            elements.alerts.append(html);
        },

        doesVideoHaveLocation: function(video) {
            const details = video.recordingDetails;

            return details &&
                details.location &&
                details.location.latitude &&
                details.location.longitude;
        },

        locationToPosition: function(video) {
            const details = video.recordingDetails;

            return {
                lat: details.location.latitude,
                lng: details.location.longitude
            }
        },

        doesVideoExistYet: function(videoId) {
            for(let i=0; i<internal.markersList.length; i++) {
                if(internal.markersList[i].about.videoId === videoId) {
                    return true;
                }
            }

            return false;
        },

        pushVideo: function(video, boolToMap, boolToList) {
            if(internal.doesVideoHaveLocation(video)) {
                if(boolToMap) {
                    const videoId = video.id;
                    const channelId = video.snippet.channelId;

                    const markerContent = format.videoToMarkerInfoWindowHtml(video);
                    const markerPopup = new google.maps.InfoWindow({
                        content: markerContent
                    });
                    const marker = new google.maps.Marker({
                        position: internal.locationToPosition(video),
                        map: internal.map,
                        markerPopup: markerPopup,
                        openPopup: () => {
                            markerPopup.open(internal.map, marker);
                        },
                        about: {
                            channelId: channelId,
                            channelTitle: video.snippet.channelTitle,
                            thumbLoaded: false,

                            videoId: videoId,
                            videoTitle: video.snippet.title,
                            videoDesc: video.snippet.description,
                            published: video.snippet.publishedAt
                        }
                    });

                    marker.addListener("click", () => {
                        marker.openPopup();
                    });

                    internal.markersList.push(marker);

                    controls.btnExport.prop("disabled", false);
                    controls.btnExport.alterClass("btn-*", "btn-sm btn-success");

                    if(internal.pageType === pageTypes.CHANNEL) {
                        const tagCount = elements[channelId].tagCount;
                        if(tagCount.length) {
                            let tags = 0;
                            for(let i=0; i<internal.markersList.length; i++) {
                                const marker = internal.markersList[i];

                                if(marker.about.channelId === channelId) {
                                    tags++;
                                }
                            }

                            if(tags > 0) {
                                controls[channelId].btnExport.prop("disabled", false);
                                controls[channelId].btnExport.alterClass("btn-*", "btn-sm btn-success");
                            }

                            tagCount.text(tags);
                        }
                    }
                }

                if(boolToList) {
                    const listItemHtml = format.videoToListItemHtml(video);

                    elements.videoDataTable.row.add([0, listItemHtml]).draw();
                }
            }
        },

        /**
         * @param address name, address, or city
         * @param callback called when done
         */
        geocode: function(address, callback) {
            this.geocoder.geocode({address: address}, (res, stat) => {
                if(stat === "OK") {
                    if(res[0]) {
                        const results = res[0];
                        const latlng = results.geometry.location;

                        controls.mapLocationMarker.setPosition(latlng);
                        controls.mapRadius.setCenter(controls.mapLocationMarker.getPosition());

                        internal.adjustMapToCenter();

                        if(callback) {
                            callback.call();
                        }
                    }
                }
            });
        },

        /**
         * @param position coordinates ot latitude and longitude (google.maps.LatLng)
         * @param callback called when done
         */
        reverseGeocode: function(position, callback) {
            this.geocoder.geocode({"location": position}, (res, stat) => {
                if(stat === "OK") {
                    if(res[0]) {
                        controls.inputAddress.attr("value", res[0].formatted_address);
                    } else {
                        controls.inputAddress.attr("value", pos.lat()+","+pos.lng());
                    }

                    if(callback) {
                        callback.call();
                    }
                }
            });
        },

        /**
         * Sets the position of the map to the center.
         */
        setMapCenter: function(lat, lng) {
            const position = new google.maps.LatLng(lat, lng);

            controls.mapLocationMarker.setPosition(position);
            controls.mapRadius.setCenter(position);
            internal.map.setCenter(position);

            internal.adjustMapToCenter();
        },

        /**
         * Adjusts the zoom & position of the map to the location marker and radius circle.
         */
        adjustMapToCenter: function() {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(controls.mapLocationMarker.getPosition());
            bounds.union(controls.mapRadius.getBounds());

            internal.map.fitBounds(bounds);
        },

        /**
         * Adjusts zoom & position of the map to result markers only.
         */
        adjustMapToResults: function() {
            const bounds = new google.maps.LatLngBounds();

            bounds.extend(controls.mapLocationMarker.getPosition());

            for(let i = 0; i < internal.markersList.length; i++) {
                bounds.extend(internal.markersList[i].getPosition());
            }

            internal.map.fitBounds(bounds);
        },

        startChannelConsumer: function() {
            if(!internal.channelConsumerStarted) {
                function loadProfileIcons() {
                    const toGrab = [];

                    for(let i=0; i<internal.markersList.length; i++) {
                        const marker = internal.markersList[i];
                        const channelId = marker.about.channelId;
                        const hasThumbYet = internal.channelThumbs.hasOwnProperty(channelId);

                        if(toGrab.length < 50) {
                            if(!hasThumbYet) {
                                if(toGrab.indexOf(channelId) === -1) {
                                    toGrab.push(channelId);
                                }
                            }
                        }

                        if(hasThumbYet && !marker.about.thumbLoaded) {
                            const placeholderStr = "https://placehold.it/18x18";
                            const thumbUrl = internal.channelThumbs[channelId];

                            const popupContentWithThumb = marker.markerPopup.getContent()
                                .replace(placeholderStr, thumbUrl);

                            marker.markerPopup.setContent(popupContentWithThumb);

                            internal.setMarkerIcon(marker, thumbUrl);

                            elements.videoDataTable.$(".authorThumb."+channelId)
                                .prop("src", thumbUrl);

                            marker.about.thumbLoaded = true;
                        }
                    }

                    if(toGrab.length > 0) {
                        console.log("Grabbing channels [" + toGrab.join(", ") + "]");

                        youtube.ajax("channels", {
                            part: "snippet",
                            maxResults: 50,
                            id: toGrab.join(",")
                        }).done((res) => {
                            res.items.forEach(item => {
                                const thumbUrl = item.snippet.thumbnails.default.url;

                                internal.channelThumbs[item.id] = thumbUrl;

                                for(let i=0; i<internal.markersList.length; i++) {
                                    const marker = internal.markersList[i];
                                    const channelId = marker.about.channelId;

                                    if(!marker.about.thumbLoaded && channelId === item.id) {
                                        internal.setMarkerIcon(marker, thumbUrl)
                                    }
                                }
                            });

                            setTimeout(loadProfileIcons, 100);
                        }).fail((err) => {
                            console.log(err);
                        });
                    } else {
                        setTimeout(loadProfileIcons, 300);
                    }
                }

                loadProfileIcons();

                internal.channelConsumerStarted = true;
            } else {
                console.error("Channel consumer is already running");
            }
        },
        channelConsumerStarted: false,
        setMarkerIcon: function(marker, iconUrl) {
            const icon = {
                url: iconUrl,
                scaledSize: new google.maps.Size(defaults.mapMarkerWidth, defaults.mapMarkerWidth),
                origin: new google.maps.Point(0,0),
                anchor: new google.maps.Point(0,0)
            };
            marker.setIcon(icon);
            marker.thumbLoaded = true;
        }
    };

    const format = {
        channelToListItemHtml(channel) {
            const snippet = channel.snippet;

            return  "<li id='"+channel.id+"' class='list-group-item d-flex flex-row channel' data-tags='0'>" +
                        "<div class='row w-100'>" +
                            "<div class='col-auto'>" +
                                "<img width='64' src='"+snippet.thumbnails.medium.url+"' />" +
                            "</div>" +
                            "<div class='col w-100'>" +
                                "<div class='row channel-title'>"+snippet.title+"</div>" +
                                "<div class='row'><span class='tag-count'>0</span>&nbsp;videos geo-tagged</div>" +
                            "</div>" +
                            "<div class='col-3'>" +
                                "<div class='row'><div class='progress w-100'><div class='progress-bar progress-bar-striped progress-bar-animated' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100'></div></div></div>" +
                                "<div class='row'><button type='button' class='btn btn-secondary btn-sm w-100 btn-save' onclick='geofind.exportToCSV(\""+channel.id+"\")' disabled>Export CSV <i class='fa fa-download' aria-hidden='true'></i></button></div>" +
                            "</div>" +
                        "</div>" +
                    "</li>";
        },

        /**
         * This general format is shared between list and marker InfoWindow content, besides a few tweaks.
         */
        videoToGeneralFormat(video, options) {
            const snippet = video.snippet;
            const details = video.recordingDetails;
            const videoThumb = snippet.thumbnails.medium.url;

            const listOpenInMap = (
                options.type === 'list' ?
                    "<div class='row'>" +
                        "<div class='col-auto'>" +
                            "<a class='openInMap' href='javascript:geofind.openInMap(\""+video.id+"\")'>" +
                                "<div>" +
                                    "<span style='vertical-align:middle'>Open in map</span>" +
                                    "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'><path fill='gray' d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>" +
                                "</div>" +
                            "</a>" +
                        "</div>" +
                    "</div>"

                    : ""
            );
            const markerCoordinates = (
                options.type === 'marker' && details && details.location ?
                    "<div class='row'>" +
                        "<div class='col'>" +
                            details.location.latitude + ", " + details.location.longitude +
                        "</div>" +
                    "</div>"

                    : ""
            );

            return  "<div class='row video' style='margin:0'>" +
                        "<div class='col-auto'>" +
                            "<img width='" + options.videoThumbWidth + "' src='" + videoThumb + "' />" +
                        "</div>" +
                        "<div class='col' style='padding-left:0'>" +
                            "<div class='row' style='font-size: 1.10em;'>" +
                                "<div class='col-auto'>" +
                                    "<a target='_blank' class='videoLink' href='https://youtu.be/" + video.id + "'>" +
                                        snippet.title +
                                    "</a>" +
                                "</div>" +
                            "</div>" +

                            "<div style='font-size:0.813em'>" +
                                "<div class='row'>" +
                                    "<div class='col-auto'>" +
                                        "<a target='_blank' class='authorLink' href='https://www.youtube.com/channel/" + snippet.channelId + "'>" +
                                            "<div>" +
                                                "<img class='authorThumb "+snippet.channelId+"' width='" + options.authorThumbWidth + "' style='vertical-align:middle;margin-right:0.25em;border-radius:5px;' src='https://placehold.it/"+options.authorThumbWidth+"x"+options.authorThumbWidth+"' />" +
                                                "<span style='vertical-align:middle;margin-left:2px;'>" + snippet.channelTitle + "</span>" +
                                            "</div>" +
                                        "</a>" +
                                    "</div>" +
                                "</div>" +

                                "<div class='row'>" +
                                    "<div class='col' style='margin-top:8px;margin-bottom:8px;'>" +
                                        snippet.description.trunc(140) +
                                    "</div>" +
                                "</div>" +

                                "<div class='row'>" +
                                    "<div class='col'>" +
                                        snippet.publishedAt +
                                    "</div>" +
                                "</div>" +

                                markerCoordinates +

                                listOpenInMap +
                            "</div>" +
                        "</div>" +
                    "</div>";
        },

        videoToListItemHtml(video) {
            return this.videoToGeneralFormat(video, {
                type: "list",
                videoThumbWidth: 246,
                authorThumbWidth: 22
            });
        },

        videoToMarkerInfoWindowHtml(video) {
            return this.videoToGeneralFormat(video, {
                type: "marker",
                videoThumbWidth: 180,
                authorThumbWidth: 18
            });
        }
    };

    const query = {
        videos: function(videoIds, callback) {
            youtube.ajax("videos", {
                id: videoIds.join(","),
                part: "snippet,recordingDetails",
                maxResults: 50
            }).done(function(res) {
                callback(res);
            }).fail(function(err) {
                console.error(err);

                internal.displayMessage("alert-warning", JSON.stringify(err));

                elements.loadingDiv.fadeOut(1000);
            });
        },

        /**
         * @param payload an object with `id` or `forUsername` key and value
         * @param callback called on success
         */
        channels: function(payload, callback) {
            youtube.ajax("channels",
                $.extend({
                    part: "snippet,contentDetails"
                }, payload)
            ).done(function(res) {
                callback(res);
            }).fail(function(err) {
                internal.displayMessage("alert-warning", JSON.stringify(err));

                console.error(err);
            });
        },
    };

    const module = {
        /**
         * To be called as a callback when the map finishes loading and we can get the map element.
         */
        onMapInit: function() {
            if (location.protocol !== "https:" && location.hostname !== "localhost") {
                location.protocol = "https:";
            }

            if(!this.onMapInitCalled) {
                console.log("Initializing app");

                const mapElement = document.getElementById("map");

                internal.init(mapElement);

                this.onMapInitCalled = true;
            } else {
                console.log("The app has already initialized itself.");
            }
        },
        onMapInitCalled: false,

        findMyLocation: function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) =>{
                    internal.setMapCenter(pos.coords.latitude, pos.coords.longitude);

                    internal.reverseGeocode(internal.map.getCenter());
                });
            }
        },

        openInMap: function(videoId) {
            for(let i=0; i<internal.markersList.length; i++) {
                const marker = internal.markersList[i];

                if(marker.about.videoId === videoId) {
                    marker.openPopup();
                }
            }
        },

        clearResults: function() {
            for(let i=0; i<internal.markersList.length; i++) {
                const marker = internal.markersList[i];

                marker.setMap(null);
            }

            internal.markersList.length = 0;

            elements.videoDataTable.clear().draw();
        },

        /**
         * @param channelId optional, specify to only match videos with this channel id
         */
        exportToCSV: function(channelId) {
            const fileName = channelId ? channelId : "geotags_all";
            const mimeType = "data:text/csv;charset=utf-8";
            const headerColumns = ["channelId", "channelTitle", "videoId", "videoTitle",
                "videoDesc", "published", "latitude", "longitude"];
            const dataRows = [];

            for(let i=0; i<internal.markersList.length; i++) {
                const marker = internal.markersList[i];
                const position = marker.getPosition();
                const about = marker.about;

                if(!channelId || channelId === about.channelId) {
                    function csvSanitize(textValue) {
                        return encodeURI(textValue.replace(/#/g, '%23'))
                            .replace(/%20/g, " ")
                    }

                    const rowData = [
                        about.channelId,
                        csvSanitize(about.channelTitle),
                        about.videoId,
                        csvSanitize(about.videoTitle),
                        csvSanitize(about.videoDesc),
                        about.published,
                        position.lat(),
                        position.lng()];

                    dataRows.push(rowData.join("\t"));
                }
            }

            const fileContents =  mimeType + "," + headerColumns.join("\t") + "\n" + dataRows.join("\n");
            const encodedContents = encodeURI(fileContents);

            const link = document.createElement("a");
            link.setAttribute("href", encodedContents);
            link.setAttribute("download", fileName + ".txt");

            document.body.appendChild(link);

            link.click();
        }
    };

    /**
     * Handles reading query parameters and updating the page based on their value.
     */
    module.params = {
        // Parameter values, will be called in order defined below.
        // Location Page Only
        paramLocation: {
            param: 'location',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(internal.pageType === pageTypes.LOCATION && paramValue) {
                    const parts = paramValue.split(",");

                    if(parts.length === 2) {
                        internal.setMapCenter(parts[0], parts[1]);
                    }
                }
            }
        },
        paramLocationAddress: {
            param: 'locationAddress',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.inputAddress.length && paramValue) {
                    controls.inputAddress.val(paramValue);
                }
            }
        },
        paramRadius: {
            param: 'radius',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.comboRadius.length && paramValue) {
                    controls.comboRadius.val(paramValue);
                    controls.comboRadius.trigger("change");
                }
            }
        },
        // Location & Topic Pages
        paramKeywords: {
            param: 'keywords',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.inputKeywords.length && paramValue) {
                    controls.inputKeywords.val(paramValue);
                }
            }
        },
        paramSort: {
            param: 'sort',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.comboSortBy.length && paramValue) {
                    controls.comboSortBy.val(paramValue);
                    controls.comboSortBy.trigger("change");
                }
            }
        },
        paramTimeframe: {
            param: 'timeframe',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.comboTimeframe.length && paramValue) {
                    controls.comboTimeframe.val(paramValue);
                    controls.comboTimeframe.trigger("change");
                }
            }
        },
        paramStart: {
            param: 'start',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.inputDateFrom.length && paramValue) {
                    controls.inputDateFrom.val(paramValue);
                }
            }
        },
        paramEnd: {
            param: 'end',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.inputDateTo.length && paramValue) {
                    controls.inputDateTo.val(paramValue);
                }
            }
        },
        paramPages: {
            param: 'pages',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.comboPageLimit.length && paramValue) {
                    controls.comboPageLimit.val(paramValue);
                    controls.comboPageLimit.trigger("change");
                }
            }
        },
        paramLive: {
            param: 'live',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.checkLive.length && paramValue === "true") {
                    controls.checkLive.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramCC: {
            param: 'cc',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.checkCC.length && paramValue === "true") {
                    controls.checkCC.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramHQ: {
            param: 'hq',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.checkHQ.length && paramValue === "true") {
                    controls.checkHQ.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramEmbedded: {
            param: 'embedded',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.checkEmbedded.length && paramValue === "true") {
                    controls.checkEmbedded.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramSyndicated: {
            param: 'syndicated',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.checkSyndicated.length && paramValue === "true") {
                    controls.checkSyndicated.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        // Channel Page Only
        paramChannels: {
            param: 'channels',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(controls.inputChannels.length && paramValue) {
                    controls.inputChannels.val(paramValue);
                }
            }
        },
        // All Pages
        paramDoSearch: {
            param: 'doSearch',
            updatePage: function(parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if(paramValue === "true") {
                    controls.btnSubmit.click();
                }
            }
        },

        showAdvancedOptions: function() {
            if(!elements.advancedDiv.is(":visible")) {
                controls.btnToggleAdvanced.click();
            }
        },

        /**
         * Parses URL query string into key-value object.
         */
        parseQuery: function(query) {
            const parsedQuery = {};

            const pairs = (query[0] === '?' ? query.substr(1) : query).split('&');

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i].split('=');

                parsedQuery[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
            }

            return parsedQuery;
        },

        /**
         * Updates the page for all query parameters if present.
         */
        updatePageFromAll: function() {
            const parsedQuery = this.parseQuery(window.location.search);

            console.log(parsedQuery);

            for(let param in this) {
                if(this[param].updatePage) {
                    this[param].updatePage(parsedQuery);
                }
            }
        }
    };

    /**
     * Assign to a variable on the window object so that the Google Maps callback can call it.
     */
    window.onMapInit = module.onMapInit;

    return module;
}());