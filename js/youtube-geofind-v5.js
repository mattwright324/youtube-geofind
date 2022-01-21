/**
 * YouTube Geofind v4
 *
 * @requires youtube-api-v3.js
 * @requires jquery
 * @requires datatables
 * @author mattwright324
 */
const geofind = (function () {

    const RFC_3339 = 'YYYY-MM-DDTHH:mm:ss';

    let videoTemplateHtml = '';
    $.ajax({
        url: './video-template.html'
    }).done(function (res) {
        console.log('Loaded video-template.html')

        videoTemplateHtml = res;
    }).fail(function (err) {
        console.err(err);
    })

    function videoToHtml(video, options) {
        const thumbs = idx(["snippet", "thumbnails"], video);
        const thumbUrl = (thumbs.medium || thumbs.default || {url: "https://placehold.it/320x180"}).url;
        const videoId = idx(["id"], video) || '';
        const videoTitle = idx(["snippet", "title"], video) || '';
        const videoDescription = idx(["snippet", "description"], video) || '';
        const publishDate = idx(["snippet", "publishedAt"], video) || '';
        const channelId = idx(["snippet", "channelId"], video) || '';
        const channelTitle = idx(["snippet", "channelTitle"], video) || '';
        const latitude = idx(["recordingDetails", "location", "latitude"], video);
        const longitude = idx(["recordingDetails", "location", "longitude"], video);
        const locationDescription = idx(["recordingDetails", "locationDescription"], video);
        const location = latitude ? latitude + ", " + longitude + (locationDescription ? "  ≡  " + locationDescription + "" : "") : "";


        const views = idx(["statistics", "viewCount"], video);
        const likes = idx(["statistics", "likeCount"], video);
        const properties = [
            views ? Number(views).toLocaleString() + " views" : "views disabled",
            likes ? Number(likes).toLocaleString() + " likes" : "likes disabled"
        ];
        const lang = idx(["snippet", "defaultLanguage"], video);
        const audioLang = idx(["snippet", "defaultAudioLanguage"], video);
        const language = lang || audioLang;
        if (language) {
            properties.push("lang:" + language)
        }
        const propertiesHtml = properties.length ?
            "<span class='tag'>" +
            properties.join("</span><span class='comma'>, </span><span class='tag'>") +
            "</span>"
            : "";

        return videoTemplateHtml
            .replace(/{type}/g, options.type)
            .replace(/{videoThumbWidth}/g, options.videoThumbSize.width)
            .replace(/{videoThumbHeight}/g, options.videoThumbSize.height)
            .replace(/{authorThumbWidth}/g, options.authorThumbSize.width)
            .replace(/{authorThumbHeight}/g, options.authorThumbSize.height)
            .replace(/{videoThumb}/g, thumbUrl)
            .replace(/{videoId}/g, videoId)
            .replace(/{videoTitle}/g, videoTitle)
            .replace(/{videoDescription}/g, videoDescription.trunc(140))
            .replace(/{publishDate}/g, publishDate)
            .replace(/{channelId}/g, channelId)
            .replace(/{channelTitle}/g, channelTitle)
            .replace(/{location}/g, location)
            .replace(/{properties}/g, propertiesHtml)
    }

    String.prototype.trunc = function (length) {
        return this.length > length ? this.substring(0, length) + "..." : this;
    };

    const hour = 60 * 60 * 1000;
    const day = hour * 24;
    const randomChannel = CHANNELS[rando(0, CHANNELS.length)];
    const randomTopic = TOPICS[rando(0, TOPICS.length)];
    const randomCoords = CITIES[rando(0, CITIES.length)];
    const idx = (p, o) => p.reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, o);

    const defaults = {
        animationMs: 250,

        // Coords are centered near New York, completely arbitrary.
        mapCenterCoords: {
            lat: randomCoords[0],
            lng: randomCoords[1]
        },

        mapMarkerWidth: 20,

        time: {
            "hour-1": hour,
            "hour-3": hour * 3,
            "hour-6": hour * 6,
            "hour-12": hour * 12,
            "hour-24": day,
            "day-7": day * 7,
            "day-30": day * 30,
            "day-90": day * 90,
            "day-365": day * 365
        }
    };
    const pageTypes = {
        UNDEFINED: "undefined",
        CHANNEL: "channel",
        TOPIC: "topic",
        LOCATION: "location"
    };
    const controls = {};
    const elements = {};

    const ProgressBar = function (element) {
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
            if (bool) {
                this.element.addClass("progress-bar-animated");
            } else {
                this.element.removeClass("progress-bar-animated");
            }
        },
        striped(bool) {
            if (bool) {
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
            const percentage = 100 * ((value - min) / (max - min));

            this.element.css("width", percentage + "%");

            if (this.textDisplay) {
                this.element.text(value + " / " + max)
            }
        }
    };

    function sortObject(unordered, sortArrays = false) {
        if (!unordered || typeof unordered !== 'object') {
            return unordered;
        }

        if (Array.isArray(unordered)) {
            const newArr = unordered.map((item) => sortObject(item, sortArrays));
            if (sortArrays) {
                newArr.sort();
            }
            return newArr;
        }

        const ordered = {};
        Object.keys(unordered)
            .sort()
            .forEach((key) => {
                ordered[key] = sortObject(unordered[key], sortArrays);
            });
        return ordered;
    }

    const internal = {
        /**
         * This should only be called once.
         */
        init: function (mapElement) {
            $("input[type='number']").inputSpinner();
            new ClipboardJS(".clipboard");

            internal.map = new google.maps.Map(mapElement, {
                zoom: 7,
                center: defaults.mapCenterCoords
            });
            internal.geocoder = new google.maps.Geocoder();

            setTimeout(function () {
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
                radius: 15000
            });
            controls.mapLocationMarker = new google.maps.Marker({
                position: internal.map.center,
                draggable: true,
                icon: {
                    url: "./img/marker.svg",
                    scaledSize: new google.maps.Size(30, 32)
                },
                title: "Drag me!",
                optimized: false,
                zIndex: 99999999,
                showing: false
            });

            controls.geotagsTable = $("#geotagsTable").DataTable({
                dom: "<'row'<'col-sm-12 col-md-4'l><'col-sm-12 col-md-4'<'#langFilterContainer'>><'col-sm-12 col-md-4'f>>" +
                    "<'row'<'col-sm-12'tr>>" +
                    "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
                iDisplayLength: 25,
                columnDefs: [
                    {
                        "targets": [0],
                        "visible": false,
                        "searchable": false
                    },
                    {
                        "targets": [2],
                        "visible": false,
                        "searchable": true
                    }
                ],
                order: [[0, 'desc']],
                lengthMenu: [[10, 25, 50, 100, 250, -1], [10, 25, 50, 100, 250, "All"]]
            });

            const defaultContextMenu = new GmapsContextMenu(internal.map, {
                options: [
                    {
                        text: "Move marker here",
                        showWhen: function () {
                            return internal.pageType === pageTypes.LOCATION;
                        },
                        onclick: function (latLng) {
                            controls.mapLocationMarker.setPosition(latLng);
                            controls.mapRadius.setCenter(latLng);

                            internal.reverseGeocode(controls.mapRadius.getCenter());
                        }
                    },
                    {
                        text: "Search here",
                        showWhen: function () {
                            return internal.pageType === pageTypes.LOCATION;
                        },
                        onclick: function (latLng) {
                            controls.mapLocationMarker.setPosition(latLng);
                            controls.mapRadius.setCenter(latLng);

                            internal.reverseGeocode(controls.mapRadius.getCenter());

                            internal.submit();
                        }
                    },
                    {
                        text: "Close all",
                        onclick: function () {
                            internal.closeAllPopups();
                        }
                    },
                    {
                        text: "Adjust to results",
                        onclick: function () {
                            internal.adjustMapToResults()
                        }
                    },
                    {
                        text: "Adjust to center",
                        showWhen: function () {
                            return internal.pageType === pageTypes.LOCATION;
                        },
                        onclick: function () {
                            internal.adjustMapToCenter()
                        }
                    }
                ]
            });
            defaultContextMenu.registerFor(controls.mapRadius);
            defaultContextMenu.registerFor(controls.mapLocationMarker);

            elements.loadingDiv = $("#loading");
            elements.loadingText = $("#loading-page");

            elements.alerts = $("#alerts");

            controls.inputChannels = $("#channels");
            elements.channelsDiv = $("#channel-list");
            elements.channelPlaceholder = $(".example");

            controls.inputAddress = $("#address");
            controls.btnGeolocate = $("#geolocate");
            controls.inputRadius = $("#radius");
            controls.inputKeywords = $("#keywords");
            controls.comboSortBy = $("#sortBy");
            controls.comboDuration = $("#videoDuration");
            controls.comboTimeframe = $("#timeframe");
            elements.customRangeDiv = $(".customRange");
            controls.inputDateFrom = $("#dateFrom");
            controls.inputDateTo = $("#dateTo");
            controls.comboPageLimit = $("#pageLimit");
            controls.shareLink = $("#shareLink");

            controls.btnToggleAdvanced = $("#btnToggleAdvanced");
            elements.advancedDiv = $("#advanced-form");
            controls.checkLive = $("#liveOnly");
            controls.checkCC = $("#creativeCommons");
            controls.checkHQ = $("#highQuality");
            controls.checkDimension3d = $("#dimension3d");

            controls.checkClearResults = $("#clearOnSearch");
            controls.checkAbsoluteTimeframe = $("#absoluteTimeframe");

            $("div#langFilterContainer").html(
                "Language: " +
                "<select id='langFilter' class='form-select form-control-sm' style='display:inline; width:auto;'>" +
                "</select>");

            $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
                const lang = $("#langFilter").val();
                if (!lang) {
                    return true;
                }

                return lang === data[2];
            });

            $("#langFilter").change(function () {
                controls.geotagsTable.draw();
            });

            // controls.btnExport = $("#btnExportAll");
            controls.btnSubmit = $("#btnSubmit");

            const typeMeta = $("meta[name='pagetype']").attr('content');
            console.log(typeMeta);
             if (controls.inputChannels.length || typeMeta === "channel") {
                this.pageType = pageTypes.CHANNEL;
            } else if (controls.inputAddress.length || typeMeta === "location") {
                this.pageType = pageTypes.LOCATION;
            } else if (controls.inputKeywords.length || typeMeta === "topic") {
                this.pageType = pageTypes.TOPIC;
            } else {
                console.error("Could not determine the page type, expected page elements do not exist.");
            }

            console.log("Determined page type was [type=" + this.pageType + "]");

            this.setupPageControls();

            module.params.updatePageFromAll();

            elements.loadingDiv.fadeOut(defaults.animationMs);
        },
        pageType: 'undefined',
        markersList: [],
        channelThumbs: {},
        languageResults: {},
        coordsMap: {},

        channelSubmit: function () {
            $("#btnSubmit").addClass("loading").addClass("disabled")
            function countdown(count) {
                console.log(count);

                $("#btnSubmit .spinner").text(count);

                setTimeout(function () {
                    if (count === 1) {
                        $("#btnSubmit").removeClass("loading").removeClass("disabled")
                    } else {
                        countdown(count - 1);
                    }
                }, 1000);
            }
            countdown(3);

            controls.shareLink.val(location.origin + location.pathname +
                "?channels=" + encodeURIComponent(controls.inputChannels.val()) + "&doSearch=true");
            controls.shareLink.attr("disabled", false);

            const channels = controls.inputChannels.val()
                .replace(/\s/g, "")
                .split(",");

            console.log(channels);

            let payload;

            for (let i = 0; i < channels.length; i++) {
                const channelStr = channels[i].trim();

                if (channelStr) {
                    if (channelStr.length === 24) {
                        payload = {id: channelStr};
                    } else if (channelStr.length <= 20) {
                        payload = {forUsername: channelStr};
                    }

                    console.log(payload);

                    elements.loadingDiv.show();

                    if (payload) {
                        query.channels(payload, function (res) {
                            const channel = res.items[0];

                            if (channel) {
                                // Does not exist in page yet
                                if (!$("#" + channel.id).length) {
                                    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

                                    const channelListHtml = format.channelToListItemHtml(channel);

                                    elements.channelPlaceholder.remove();
                                    elements.channelsDiv.append(channelListHtml);

                                    elements[channel.id] = {};
                                    elements[channel.id].progress = new ProgressBar("#" + channel.id + " .progress-bar");
                                    elements[channel.id].tagCount = $("#" + channel.id + " .tag-count");

                                    controls[channel.id] = {};
                                    // controls[channel.id].btnExport = $("#" + channel.id + " .btn-save");

                                    let videoTotal = 0;

                                    function searchPlaylist(pageToken) {
                                        youtube.ajax("playlistItems", {
                                            part: "snippet",
                                            maxResults: 50,
                                            playlistId: uploadsPlaylistId,
                                            pageToken: pageToken
                                        }).done(function (res) {
                                            console.log("Searching [playlistId=" + uploadsPlaylistId + ", pageToken=" + pageToken + ", totalVideos=" + videoTotal + "]");

                                            if (pageToken === "") {
                                                elements[channel.id].progress.setRange(0, res.pageInfo.totalResults);
                                            }

                                            videoTotal += res.items.length;

                                            elements[channel.id].progress.setValue(videoTotal);

                                            const videoIds = [];
                                            for (let i = 0; i < res.items.length; i++) {
                                                const playlistVideo = res.items[i];

                                                videoIds.push(playlistVideo.snippet.resourceId.videoId);
                                            }

                                            console.log(videoIds);

                                            query.videos(videoIds, function (res) {
                                                console.log(res);

                                                for (let i = 0; i < res.items.length; i++) {
                                                    const video = res.items[i];

                                                    internal.pushVideo(video, true, true);
                                                }
                                            });

                                            if (internal.markersList.length > 0) {
                                                internal.adjustMapToResults();
                                            }

                                            if (res.hasOwnProperty("nextPageToken")) {
                                                searchPlaylist(res.nextPageToken);
                                            } else {
                                                elements.loadingDiv.fadeOut(defaults.animationMs);
                                                elements[channel.id].progress.animated(false);
                                            }
                                        }).fail(function (err) {
                                            elements[channel.id].progress.setBg("bg-danger");

                                            internal.displayError("alert-warning", err);

                                            console.error(err);
                                        })
                                    }

                                    searchPlaylist("");
                                } else {
                                    console.warn("Channel was already in the list '" + channel.id + "'");
                                }
                            } else {
                                internal.displayMessage("alert-warning", "Channel does not exist '" + channelStr + "'");
                            }
                        });
                    } else {
                        internal.displayMessage("alert-warning", "Did not recognize value as id or username '" + channelStr + "'");

                        console.error("Channel value didn't match expected lengths.");
                    }
                } else {
                    console.error("Channel value was empty.");
                }
            }

            elements.loadingDiv.fadeOut(defaults.animationMs);
        },

        buildShareLink: function () {
            const params = [];
            if (internal.pageType === pageTypes.LOCATION) {
                const position = controls.mapLocationMarker.getPosition();
                params.push("location=" + position.lat() + "," + position.lng());

                const radius = controls.inputRadius.val();
                if (radius !== 15) {
                    params.push("radius=" + radius);
                }
            }
            const keywords = controls.inputKeywords.val();
            if (keywords.trim().length > 0) {
                params.push("keywords=" + encodeURIComponent(keywords))
            }
            const absolute = controls.checkAbsoluteTimeframe.is(":checked");
            const timeframe = controls.comboTimeframe.find(":selected").val();
            if (timeframe !== 'any' && (timeframe === 'custom' || absolute)) {
                params.push("timeframe=custom");
                if (absolute && timeframe !== 'custom') {
                    const dateTo = new Date();
                    const dateFrom = new Date();
                    dateFrom.setTime(dateTo.getTime() - defaults.time[timeframe]);
                    params.push("start=" + moment(dateFrom).utcOffset(0, true).format(RFC_3339));
                    params.push("end=" + moment(dateTo).utcOffset(0, true).format(RFC_3339));
                    params.push("timeframeWas=" + timeframe);
                } else {
                    params.push("start=" + controls.inputDateFrom.val())
                    params.push("end=" + controls.inputDateTo.val())
                }
            } else if (timeframe !== 'any') {
                params.push("timeframe=" + timeframe);
            }
            const sortBy = controls.comboSortBy.find(":selected").val();
            if (sortBy !== 'date') {
                params.push("sort=" + encodeURIComponent(sortBy))
            }
            const duration = controls.comboDuration.find(":selected").val();
            if (duration !== 'any') {
                params.push("duration=" + encodeURIComponent(duration))
            }
            const pages = controls.comboPageLimit.find(":selected").val();
            if (pages !== '3') {
                params.push("pages=" + encodeURIComponent(pages))
            }
            const islive = controls.checkLive.is(":checked");
            if (islive === true) {
                params.push("live=" + encodeURIComponent(islive))
            }
            const iscreativeCommons = controls.checkCC.is(":checked");
            if (iscreativeCommons === true) {
                params.push("creativeCommons=" + encodeURIComponent(iscreativeCommons))
            }
            const ishd = controls.checkHQ.is(":checked");
            if (ishd === true) {
                params.push("hd=" + encodeURIComponent(ishd))
            }
            const is3d = controls.checkDimension3d.is(":checked");
            if (is3d === true) {
                params.push("3d=" + encodeURIComponent(is3d))
            }
            params.push("doSearch=true");

            controls.shareLink.val(location.origin + location.pathname + "?" + params.join("&"));
            controls.shareLink.attr("disabled", false);
        },

        submit: function () {
            $("#btnSubmit").addClass("loading").addClass("disabled")
            function countdown(count) {
                console.log(count);

                $("#btnSubmit .spinner").text(count);

                setTimeout(function () {
                    if (count === 1) {
                        $("#btnSubmit").removeClass("loading").removeClass("disabled")
                    } else {
                        countdown(count - 1);
                    }
                }, 1000);
            }
            countdown(3)

            internal.buildShareLink();

            if (controls.checkClearResults.is(":checked")) {
                module.clearResults();
            }

            const maxPages = controls.comboPageLimit.find(":selected").val();

            let pageValue = 0;

            elements.loadingDiv.show();

            function search(pageToken) {
                console.log("Searching [pageValue=" + pageValue + ", maxPages=" + maxPages + ", pageToken=" + pageToken + "]");

                elements.loadingText.text("Pg " + (pageValue + 1));

                youtube.ajax("search", internal.getRequestPayload(pageToken)).done((res) => {
                    console.log(res);

                    const videoIds = [];
                    (res.items || []).forEach(function (searchResult) {
                        videoIds.push(searchResult.id.videoId);
                    });

                    console.log(videoIds);

                    query.videos(videoIds, function (res) {
                        console.log(res);

                        (res.items || []).forEach(function (video) {
                            if (!internal.doesVideoExistYet(video.id)) {
                                internal.pushVideo(video, true, true);
                            }
                        });
                    });

                    pageValue++;

                    if (res.hasOwnProperty("nextPageToken") && pageValue < maxPages) {
                        search(res.nextPageToken);
                    } else {
                        elements.loadingDiv.fadeOut(defaults.animationMs);
                    }
                }).fail((err) => {
                    pageToken = null;

                    elements.loadingDiv.fadeOut(defaults.animationMs);

                    internal.displayError("alert-warning", err);

                    console.error(err);
                });
            }

            search("");
        },


        setupPageControls: function () {
            const KEY_ENTER = 13;

            internal.startChannelConsumer();

            controls.checkAbsoluteTimeframe.change(function () {
                if (controls.shareLink.val().length) {
                    internal.buildShareLink();
                }
            });

            var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl)
            })

            if (this.pageType === pageTypes.CHANNEL) {
                controls.inputChannels.val(randomChannel);
                controls.inputChannels.keyup(function (event) {
                    if (event.keyCode === KEY_ENTER) {
                        $("#btnFind").click();
                    }
                });

                controls.btnSubmit.on('click', internal.channelSubmit)
            } else {
                if (this.pageType === pageTypes.LOCATION) {
                    controls.mapLocationMarker.setMap(this.map);
                    controls.mapRadius.setMap(this.map);

                    // Move radius circle and map to drop location.
                    controls.mapLocationMarker.addListener("dragend", () => {
                        const center = controls.mapLocationMarker.getPosition();

                        controls.mapRadius.setCenter(center);

                        internal.adjustMapToCenter();

                        internal.reverseGeocode(controls.mapRadius.getCenter());
                    });

                    // Geocode address on pressing Enter in address textfield
                    controls.inputAddress.on("keyup", function (event) {
                        if (event.keyCode === KEY_ENTER) {
                            internal.geocode(controls.inputAddress.val());
                        }
                    });

                    // When radius selection changes, adjust zoom on map.
                    controls.inputRadius.change(function () {
                        let radiusInKm = controls.inputRadius.val();
                        if (radiusInKm < 1) {
                            radiusInKm = 1;
                        }
                        if (radiusInKm > 1000) {
                            radiusInKm = 1000;
                        }
                        const radiusInMeters = radiusInKm * 1000;

                        controls.mapRadius.setRadius(radiusInMeters);

                        internal.adjustMapToCenter();
                    });

                    internal.reverseGeocode(internal.map.getCenter());
                    internal.adjustMapToCenter();
                } else {
                    controls.inputKeywords.val(randomTopic);
                }

                controls.comboTimeframe.change(function () {
                    const value = controls.comboTimeframe.find(":selected").val();

                    if (value === "custom") {
                        elements.customRangeDiv.show();
                    } else {
                        elements.customRangeDiv.hide();
                    }
                });

                controls.inputDateTo.val(moment().format('yyyy-MM-DDT23:59'));

                controls.btnToggleAdvanced.on('click', function () {
                    if (elements.advancedDiv.is(":visible")) {
                        elements.advancedDiv.slideUp(defaults.animationMs);
                    } else {
                        elements.advancedDiv.slideDown(defaults.animationMs);
                    }
                });

                controls.btnSubmit.on('click', internal.submit);

                controls.checkClearResults.prop("checked", true);
            }
        },

        /**
         * This returns the payload for topic and location searching.
         *
         * Channel doesn't need this as it will do it's own handling for the request.
         */
        getRequestPayload: function (pageToken) {
            const request = {};

            if (internal.pageType === pageTypes.CHANNEL) {
                console.error("internal.getRequestPayload() shouldn't be called on the channel page")
            } else {
                request.part = "id";
                request.maxResults = 50;
                request.type = "video";
                request.pageToken = pageToken;

                if (internal.pageType === pageTypes.LOCATION) {
                    const position = controls.mapLocationMarker.getPosition();

                    request.location = position.lat() + "," + position.lng();
                    request.locationRadius = controls.inputRadius.val() * 1000 + "m";
                }

                request.q = controls.inputKeywords.val();
                request.order = controls.comboSortBy.find(":selected").val();

                if (controls.checkCC.is(":checked")) {
                    request.videoLicense = "creativecommon"
                }
                if (controls.checkLive.is(":checked")) {
                    request.eventType = "live";
                }
                if (controls.checkHQ.is(":checked")) {
                    request.videoDefinition = "high";
                }
                if (controls.checkDimension3d.is(":checked")) {
                    request.videoDimension = "3d";
                }

                const duration = controls.comboDuration.find(":selected").val();
                if (duration !== "any") {
                    request.videoDuration = duration;
                }

                const timeVal = controls.comboTimeframe.find(":selected").val();
                if (timeVal !== "any") {
                    let dateFrom = new Date();
                    let dateTo = new Date();

                    if (timeVal === "custom") {
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

        displayError: function (type, err) {
            const firstError = idx(["responseJSON", "error", "errors", 0], err);
            if (firstError) {
                if (firstError.reason === "quotaExceeded") {
                    const html = "<strong>Quota Exceeded</strong> " +
                        "The daily API quota of 1,000,000 units has been reached for this application. " +
                        "This quota resets at midnight Pacific Time (PT) as per the Google Developers Console. " +
                        "See more detail here with <a target='_blank' href='https://github.com/mattwright324/youtube-geofind/issues/11' rel='noopener'>issue #11</a>.";

                    this.displayMessage('alert-warning', html);
                } else {
                    this.displayMessage('alert-warning', JSON.stringify(err));
                }
            }
        },

        displayMessage: function (type, message) {
            const html =
                "<div class='alert " + type + " alert-dismissible fade show' role='alert'>" +
                message +
                "<button type='button' class='btn-close' data-bs-dismiss='alert' aria-label='Close'></button>" +
                "</div>";

            elements.alerts.append(html);
        },

        doesVideoHaveLocation: function (video) {
            return idx(["recordingDetails", "location", "latitude"], video);
        },

        locationToPosition: function (video) {
            const location = idx(["recordingDetails", "location"], video);
            return {
                lat: location.latitude,
                lng: location.longitude
            }
        },

        doesVideoExistYet: function (videoId) {
            for (let i = 0; i < internal.markersList.length; i++) {
                if (internal.markersList[i].about.videoId === videoId) {
                    return true;
                }
            }

            return false;
        },

        getLanguage: function (video) {
            return video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage;
        },

        updateLanguageDropdown: function (video) {
            // Add lang to map, update counts
            const beforeLanguageCount = Object.keys(internal.languageResults).length;
            const lang = internal.getLanguage(video);
            internal.languageResults[lang] = ++internal.languageResults[lang] || 1;
            const afterLanguageCount = Object.keys(internal.languageResults).length;
            const totalResults = Object.values(internal.languageResults).reduce((total, langNum) => total + langNum);

            if (beforeLanguageCount !== afterLanguageCount) {
                // Rebuild html if new languages present, sort languages
                internal.languageResults = sortObject(internal.languageResults);

                $("#langFilter")
                    .html("<option selected value='' data-lang='all'>All (" + totalResults + ")</option>");

                Object.keys(internal.languageResults).forEach(lang => {
                    $("#langFilter").append(
                        "<option value='" + lang + "' data-lang='" + lang + "'>" +
                        String(lang) + " (" + internal.languageResults[lang] + ")" +
                        "</option>");
                });
            } else {
                // Otherwise just update count of existing language for this video
                $("option[data-lang='all']").text("All (" + totalResults + ")");
                $("option[data-lang='" + lang + "']").text(lang + " (" + internal.languageResults[lang] + ")")
            }
        },

        pushVideo: function (video, boolToMap, boolToList) {
            if (internal.doesVideoHaveLocation(video)) {
                if (boolToMap) {
                    const videoId = video.id;
                    const channelId = video.snippet.channelId;

                    const markerContent = format.videoToMarkerInfoWindowHtml(video);
                    const latLng = "[" + video.recordingDetails.location.latitude + "," + video.recordingDetails.location.longitude + "]";
                    const markerPopup = new google.maps.InfoWindow({
                        content: markerContent
                    });
                    const marker = new google.maps.Marker({
                        position: internal.locationToPosition(video),
                        map: internal.map,
                        markerPopup: markerPopup,
                        about: {
                            channelId: channelId,
                            channelTitle: video.snippet.channelTitle,
                            thumbLoaded: false,

                            videoId: videoId,
                            videoTitle: video.snippet.title,
                            videoDesc: video.snippet.description,
                            published: video.snippet.publishedAt,
                            locationDescription: video.recordingDetails.locationDescription,
                            language: String(internal.getLanguage(video))
                        },
                        openPopup: () => {
                            markerPopup.open(internal.map, marker);

                            google.maps.event.addListener(markerPopup, "domready", function () {
                                const count = internal.coordsMap[latLng].length;

                                if (count > 1) {
                                    let options = [];
                                    internal.coordsMap[latLng].sort(function (a, b) {
                                        return a.about.videoTitle > b.about.videoTitle
                                    });
                                    for (let i = 0; i < count; i++) {
                                        const marker = internal.coordsMap[latLng][i];
                                        const markerId = marker.about.videoId;
                                        const selected = videoId === markerId ? " selected" : "";
                                        options.push("<option value='" + markerId + "'" + selected + ">" + marker.about.videoTitle.trunc(30) + "</option>");
                                    }

                                    const html =
                                        "<span style='margin-bottom:10px;'>" +
                                        "<select style='max-width: 300px' class='form-select form-control-sm '>" +
                                        options.join("") +
                                        "</select>" +
                                        "</span>" +
                                        "<span style='margin-bottom:10px;margin-left:10px;display:flex;align-items:center;'>" +
                                        count + " videos at same coords" +
                                        "</span>";

                                    $(".type-marker." + videoId + " .multi").html(html);
                                    const select = $(".type-marker." + videoId + " .multi select")
                                    select.change(function () {
                                        const selectedVideo = select.val();
                                        marker.closePopup();
                                        module.openInMap(selectedVideo, true);
                                    });
                                }
                            });
                        },
                        closePopup: () => {
                            markerPopup.close();
                        }
                    });

                    if (internal.coordsMap[latLng]) {
                        internal.coordsMap[latLng].push(marker);
                    } else {
                        internal.coordsMap[latLng] = [marker];
                    }

                    marker.addListener("click", () => {
                        marker.openPopup();
                    });

                    internal.markersList.push(marker);
                    internal.adjustMapToResults();

                    // controls.btnExport.prop("disabled", false);
                    // controls.btnExport.alterClass("btn-*", "btn-sm btn-success");

                    if (internal.pageType === pageTypes.CHANNEL) {
                        const tagCount = elements[channelId].tagCount;
                        if (tagCount.length) {
                            let tags = 0;
                            for (let i = 0; i < internal.markersList.length; i++) {
                                const marker = internal.markersList[i];

                                if (marker.about.channelId === channelId) {
                                    tags++;
                                }
                            }

                            if (tags > 0) {
                                // controls[channelId].btnExport.prop("disabled", false);
                                // controls[channelId].btnExport.alterClass("btn-*", "btn-sm btn-success");
                            }

                            tagCount.text(tags);
                        }
                    }
                }

                if (boolToList) {
                    const listItemHtml = format.videoToListItemHtml(video);

                    controls.geotagsTable.row.add([0, listItemHtml, String(video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage)]).draw();

                    internal.updateLanguageDropdown(video);
                }
            }
        },

        /**
         * @param address name, address, or city
         * @param callback called when done
         */
        geocode: function (address, callback) {
            this.geocoder.geocode({address: address}, (res, stat) => {
                if (stat === "OK") {
                    if (res[0]) {
                        const results = res[0];
                        const latlng = results.geometry.location;

                        controls.mapLocationMarker.setPosition(latlng);
                        controls.mapRadius.setCenter(controls.mapLocationMarker.getPosition());

                        internal.adjustMapToCenter();

                        if (callback) {
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
        reverseGeocode: function (position, callback) {
            this.geocoder.geocode({"location": position}, (res, stat) => {
                if (stat === "OK") {
                    if (res[0]) {
                        controls.inputAddress.attr("value", res[0].formatted_address);
                    } else {
                        controls.inputAddress.attr("value", pos.lat() + "," + pos.lng());
                    }

                    if (callback) {
                        callback.call();
                    }
                }
            });
        },

        /**
         * Sets the position of the map to the center.
         */
        setMapCenter: function (lat, lng) {
            const position = new google.maps.LatLng(lat, lng);

            controls.mapLocationMarker.setPosition(position);
            controls.mapRadius.setCenter(position);
            internal.map.setCenter(position);

            internal.adjustMapToCenter();
        },

        /**
         * Adjusts the zoom & position of the map to the location marker and radius circle.
         */
        adjustMapToCenter: function () {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(controls.mapLocationMarker.getPosition());
            bounds.union(controls.mapRadius.getBounds());

            internal.map.fitBounds(bounds);
        },

        /**
         * Adjusts zoom & position of the map to result markers only.
         */
        adjustMapToResults: function () {
            const bounds = new google.maps.LatLngBounds();

            bounds.extend(controls.mapLocationMarker.getPosition());

            for (let i = 0; i < internal.markersList.length; i++) {
                bounds.extend(internal.markersList[i].getPosition());
            }

            internal.map.fitBounds(bounds);
        },

        startChannelConsumer: function () {
            if (!internal.channelConsumerStarted) {
                function loadProfileIcons() {
                    const toGrab = [];

                    for (let i = 0; i < internal.markersList.length; i++) {
                        const marker = internal.markersList[i];
                        const channelId = marker.about.channelId;
                        const hasThumbYet = internal.channelThumbs.hasOwnProperty(channelId);

                        if (toGrab.length < 50) {
                            if (!hasThumbYet) {
                                if (toGrab.indexOf(channelId) === -1) {
                                    toGrab.push(channelId);
                                }
                            }
                        }

                        if (hasThumbYet && !marker.about.thumbLoaded) {
                            const placeholderStr = "https://placehold.it/18x18";
                            const thumbUrl = internal.channelThumbs[channelId];

                            const popupContentWithThumb = marker.markerPopup.getContent()
                                .replace(placeholderStr, thumbUrl);

                            marker.markerPopup.setContent(popupContentWithThumb);

                            internal.setMarkerIcon(marker, thumbUrl);

                            controls.geotagsTable.$(".authorThumb." + channelId)
                                .prop("src", thumbUrl);

                            marker.about.thumbLoaded = true;
                        }
                    }

                    if (toGrab.length > 0) {
                        console.log("Grabbing channels [" + toGrab.join(", ") + "]");

                        youtube.ajax("channels", {
                            part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails",
                            maxResults: 50,
                            id: toGrab.join(",")
                        }).done((res) => {
                            (res.items || []).forEach(item => {
                                const thumbs = idx(["snippet", "thumbnails"], item);
                                const thumbUrl = (thumbs.default || thumbs.medium || {url: "https://placehold.it/22x22"}).url;
                                internal.channelThumbs[item.id] = thumbUrl;

                                for (let i = 0; i < internal.markersList.length; i++) {
                                    const marker = internal.markersList[i];
                                    const channelId = marker.about.channelId;

                                    if (!marker.about.thumbLoaded && channelId === item.id) {
                                        internal.setMarkerIcon(marker, thumbUrl)
                                    }
                                }
                            });

                            setTimeout(loadProfileIcons, 100);
                        }).fail((err) => {
                            console.log(err);
                        });
                    } else {
                        setTimeout(loadProfileIcons, 500);
                    }
                }

                loadProfileIcons();

                internal.channelConsumerStarted = true;
            } else {
                console.error("Channel consumer is already running");
            }
        },
        channelConsumerStarted: false,
        setMarkerIcon: function (marker, iconUrl) {
            const icon = {
                url: iconUrl,
                scaledSize: new google.maps.Size(defaults.mapMarkerWidth, defaults.mapMarkerWidth),
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(0, 0)
            };
            marker.setIcon(icon);
            marker.thumbLoaded = true;
        },

        closeAllPopups: function () {
            for (let i = 0; i < internal.markersList.length; i++) {
                const marker = internal.markersList[i];

                marker.closePopup();
            }
        }
    };

    const format = {
        videoToListItemHtml(video) {
            return videoToHtml(video, {
                type: "list",
                videoThumbSize: {
                    width: 320,
                    height: 180
                },
                authorThumbSize: {
                    width: 22,
                    height: 22
                }
            });
        },

        videoToMarkerInfoWindowHtml(video) {
            return videoToHtml(video, {
                type: "marker",
                videoThumbSize: {
                    width: 200,
                    height: 112
                },
                authorThumbSize: {
                    width: 18,
                    height: 18
                }
            });
        }
    };

    const query = {
        videos: function (videoIds, callback) {
            youtube.ajax("videos", {
                id: videoIds.join(","),
                part: "snippet,statistics,recordingDetails,status,liveStreamingDetails,localizations,contentDetails,topicDetails",
                maxResults: 50
            }).done(function (res) {
                callback(res);
            }).fail(function (err) {
                console.error(err);

                internal.displayError("alert-warning", err);

                elements.loadingDiv.fadeOut(1000);
            });
        },

        /**
         * @param payload an object with `id` or `forUsername` key and value
         * @param callback called on success
         */
        channels: function (payload, callback) {
            youtube.ajax("channels",
                $.extend({
                    part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails"
                }, payload)
            ).done(function (res) {
                callback(res);
            }).fail(function (err) {
                internal.displayError("alert-warning", err);

                console.error(err);
            });
        },
    };

    const module = {
        /**
         * To be called as a callback when the map finishes loading and we can get the map element.
         */
        onMapInit: function () {
            if (location.protocol !== "https:" && location.hostname !== "localhost") {
                location.protocol = "https:";
            }

            if (!this.onMapInitCalled) {
                console.log("Initializing app");

                const mapElement = document.getElementById("map");

                internal.init(mapElement);

                this.onMapInitCalled = true;
            } else {
                console.log("The app has already initialized itself.");
            }
        },
        onMapInitCalled: false,

        findMyLocation: function () {
            $("#geolocate").addClass("loading").addClass("disabled")

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    internal.setMapCenter(pos.coords.latitude, pos.coords.longitude);

                    internal.reverseGeocode(internal.map.getCenter());
                });
            }

            function countdown(count) {
                console.log(count);

                $("#geolocate .spinner").text(count);

                setTimeout(function () {
                    if (count === 1) {
                        $("#geolocate").removeClass("loading").removeClass("disabled")
                    } else {
                        countdown(count - 1);
                    }
                }, 1000);
            }
            countdown(3)
        },

        randomLocation: function () {
            $("#randomLocation").addClass("loading").addClass("disabled")

            const randomCoords = CITIES[rando(0, CITIES.length)];

            defaults.mapCenterCoords = {
                lat: randomCoords[0],
                lng: randomCoords[1]
            }

            internal.setMapCenter(randomCoords[0], randomCoords[1]);
            internal.reverseGeocode(internal.map.getCenter());

            function countdown(count) {
                console.log(count);

                $("#randomLocation .spinner").text(count);

                setTimeout(function () {
                    if (count === 1) {
                        $("#randomLocation").removeClass("loading").removeClass("disabled")
                    } else {
                        countdown(count - 1);
                    }
                }, 1000);
            }
            countdown(3)
        },

        openInMap: function (videoId, focusOnSelect) {
            for (let i = 0; i < internal.markersList.length; i++) {
                const marker = internal.markersList[i];

                if (marker.about.videoId === videoId) {
                    marker.openPopup();

                }
            }

            if (focusOnSelect) {
                setTimeout(function () {
                    $(".type-marker." + videoId + " .multi select").focus().click();
                }, 50);
            }
        },

        clearResults: function () {
            for (let i = 0; i < internal.markersList.length; i++) {
                const marker = internal.markersList[i];

                marker.setMap(null);
            }

            internal.markersList.length = 0;
            internal.languageResults = {}
            internal.coordsMap = {}

            controls.geotagsTable.clear().draw();
        },

        /**
         * @param channelId optional, specify to only match videos with this channel id
         */
        exportToCSV: function (channelId) {
            const fileName = channelId ? channelId : "geotags_all";
            const mimeType = "data:text/csv;charset=utf-8";
            const headerColumns = ["channelId", "channelTitle", "videoId", "videoTitle",
                "videoDesc", "published", "latitude", "longitude", "locationDescription",
                "language"];
            const dataRows = [];

            for (let i = 0; i < internal.markersList.length; i++) {
                const marker = internal.markersList[i];
                const position = marker.getPosition();
                const about = marker.about;

                if (!channelId || channelId === about.channelId) {
                    function csvSanitize(textValue) {
                        if (!textValue) {
                            return "";
                        }
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
                        position.lng(),
                        csvSanitize(about.locationDescription),
                        csvSanitize(about.language)
                    ];

                    dataRows.push(rowData.join("\t"));
                }
            }

            const fileContents = mimeType + "," + headerColumns.join("\t") + "\n" + dataRows.join("\n");
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
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (internal.pageType === pageTypes.LOCATION && paramValue) {
                    const parts = paramValue.split(",");

                    if (parts.length === 2) {
                        internal.setMapCenter(parts[0], parts[1]);
                    }
                }
            }
        },
        paramRadius: {
            param: 'radius',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.inputRadius.length && paramValue) {
                    controls.inputRadius.val(paramValue);
                    controls.inputRadius.trigger("change");
                }
            }
        },
        // Location & Topic Pages
        paramKeywords: {
            param: 'keywords',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.inputKeywords.length && paramValue) {
                    controls.inputKeywords.val(paramValue);
                }
            }
        },
        paramSort: {
            param: 'sort',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#sort option[value='" + paramValue + "']").length) {
                    controls.comboSortBy.val(paramValue);
                    controls.comboSortBy.trigger("change");
                }
            }
        },
        paramDuration: {
            param: 'duration',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#duration option[value='" + paramValue + "']").length) {
                    controls.comboDuration.val(paramValue);
                    controls.comboDuration.trigger("change");
                }
            }
        },
        paramTimeframe: {
            param: 'timeframe',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#timeframe option[value='" + paramValue + "']").length) {
                    controls.comboTimeframe.val(paramValue);
                    controls.comboTimeframe.trigger("change");
                }
            }
        },
        paramStart: {
            param: 'start',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                const rfcDate = moment(paramValue).utcOffset(0, true).format(RFC_3339);
                if (controls.inputDateFrom.length && rfcDate && rfcDate !== 'Invalid date') {
                    controls.inputDateFrom.val(rfcDate);
                }
            }
        },
        paramEnd: {
            param: 'end',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                const rfcDate = moment(paramValue).utcOffset(0, true).format(RFC_3339);
                if (controls.inputDateTo.length && rfcDate && rfcDate !== 'Invalid date') {
                    controls.inputDateTo.val(rfcDate);
                }
            }
        },
        paramPages: {
            param: 'pages',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.comboPageLimit.length && paramValue) {
                    controls.comboPageLimit.val(paramValue);
                    controls.comboPageLimit.trigger("change");
                }
            }
        },
        paramLive: {
            param: 'live',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.checkLive.length && paramValue === "true") {
                    controls.checkLive.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramCC: {
            param: 'cc',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.checkCC.length && paramValue === "true") {
                    controls.checkCC.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        paramHQ: {
            param: 'hq',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.checkHQ.length && paramValue === "true") {
                    controls.checkHQ.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        param3D: {
            param: '3d',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.checkDimension3d.length && paramValue === "true") {
                    controls.checkDimension3d.prop("checked", true);

                    module.params.showAdvancedOptions();
                }
            }
        },
        // Channel Page Only
        paramChannels: {
            param: 'channels',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.inputChannels.length && paramValue) {
                    controls.inputChannels.val(paramValue);
                }
            }
        },
        // All Pages
        paramDoSearch: {
            param: 'doSearch',
            shouldSearch: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                return paramValue === "true";
            },
            updatePage: function (parsedQuery) {
                if (this.shouldSearch(parsedQuery) && !parsedQuery[module.params.paramLocationAddress.param]) {
                    controls.btnSubmit.click();
                }
            }
        },
        paramLocationAddress: {
            param: 'locationAddress',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (controls.inputAddress.length && paramValue) {
                    controls.inputAddress.val(paramValue);

                    if (paramValue.length) {
                        internal.geocode(paramValue, function () {
                            if (module.params.paramDoSearch.shouldSearch(parsedQuery)) {
                                controls.btnSubmit.click();
                            }
                        });
                    }
                }
            }
        },

        showAdvancedOptions: function () {
            if (!elements.advancedDiv.is(":visible")) {
                controls.btnToggleAdvanced.click();
            }
        },

        /**
         * Parses URL query string into key-value object.
         */
        parseQuery: function (query) {
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
        updatePageFromAll: function () {
            const parsedQuery = this.parseQuery(window.location.search);

            console.log(parsedQuery);

            for (let param in this) {
                if (this[param].updatePage) {
                    this[param].updatePage(parsedQuery);
                }
            }
        }
    };

    module.elements = elements;
    module.controls = controls;

    /**
     * Assign to a variable on the window object so that the Google Maps callback can call it.
     */
    window.onMapInit = module.onMapInit;

    return module;
}());
