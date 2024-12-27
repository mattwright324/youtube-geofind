/**
 * YouTube Geofind v4
 *
 * @requires youtube-api-v3.js
 * @requires jquery
 * @requires datatables
 * @author mattwright324
 */
const geofind = (function () {
    const pageType = document.querySelector("meta[name='pagetype']")?.content;
    const LOCATION = "location";
    const TOPIC = "topic";
    const CHANNEL = "channel";

    mapboxgl.accessToken = 'pk.eyJ1IjoibWF0dHdyaWdodDMyNCIsImEiOiJjbGV5b2E0M3UwMTR2M3NwNXZ4dnM4MnBpIn0.oA1JtsrXRBEIxljzZ5Q5lA';

    const RFC_3339 = 'YYYY-MM-DDTHH:mm:ss';
    const KEY_ENTER = 13;

    String.prototype.trunc = function (length) {
        return this.length > length ? this.substring(0, length) + "..." : this;
    };

    const delayFindMeKey = "delayFindMeKey";
    const delayRandomLocKey = "delayRandomLocKey";
    const delaySubmitKey = "delaySubmitKey";
    const delaySearchInputKey = "delaySearchInputKey";

    const can = {
        submit: true,
        findMe: true,
        randomLoc: true,
        searchInput: true,
    };

    const apiNextPageMs = 600;
    const delay15Sec = 15;
    const delay15SecMs = delay15Sec * 1000;
    const delay5Sec = 5;
    const delay5SecMs = delay5Sec * 1000;

    function countdown(key, control, delay, flag) {
        control.addClass("loading").addClass("disabled");
        can[flag] = false;

        let value = localStorage.getItem(key);
        if (!moment(value).isValid()) {
            console.warn('value for %s was not a valid date, resetting to now', key);
            localStorage.setItem(key, new Date());
            value = localStorage.getItem(key);
        }
        if (moment(value).isAfter(moment())) {
            console.warn('value for %s was set in the future, resetting to now', key);
            localStorage.setItem(key, new Date());
            value = localStorage.getItem(key);
        }
        let count = (delay - moment().diff(value)) / 1000;
        control.find(".countdown").text(Math.trunc(count));

        function c(control, count) {
            if (count <= 1) {
                control.removeClass("loading").removeClass("disabled");
                control.find(".countdown").text("");

                can[flag] = true;
            } else {
                control.find(".countdown").text(Math.trunc(count));
                setTimeout(function () {
                    c(control, count - 1)
                }, 1000);
            }
        }

        setTimeout(function () {
            c(control, count)
        }, 1000);
    }

    function countdownCheck(key, control, delayMs, flag) {
        const value = localStorage.getItem(key);
        if (key in localStorage && moment(value).isValid() && moment().diff(value) < delayMs) {
            countdown(key, control, delayMs, flag);
        } else {
            control.removeClass("loading").removeClass("disabled");
            control.find(".countdown").text("");
        }
    }

    const animationMs = 250;
    const hourMs = 60 * 60 * 1000;
    const dayMs = hourMs * 24;
    const timeMs = {
        "hour-1": hourMs,
        "hour-3": hourMs * 3,
        "hour-6": hourMs * 6,
        "hour-12": hourMs * 12,
        "hour-24": dayMs,
        "day-7": dayMs * 7,
        "day-30": dayMs * 30,
        "day-90": dayMs * 90,
        "day-180": dayMs * 180,
        "day-365": dayMs * 365,
        "year": dayMs * 365
    };

    const randomCoords = shared ? shared.randomFromList(CITIES) : [35.689, 139.692];

    // Mapbox reads coords in [lng,lat] instead of [lat,lng]
    function swapCoords(coords) {
        return [coords?.[1], coords?.[0]];
    }

    const controls = {};
    const elements = {};

    let uniqueVideoIds = {};
    let rawVideoData = [];
    let rawChannelMap = {};
    let rawPlaylistMap = {};
    let playlistMap = {};
    let coordsMap = {}; // coordinate to marker. first video processed at coord gets the marker
    let popupMap = {}; // video id to marker popup
    let markersList = [];
    let shareUrls = [];
    let absoluteShareUrls = [];
    let languageResults = {};

    let videoTemplateHtml = '';
    $.ajax({
        url: './video-template.html'
    }).done(function (res) {
        console.log('Loaded video-template.html')

        videoTemplateHtml = res;
    }).fail(function (err) {
        console.err(err);
    });

    function doneProgressMessage() {
        return [
            rawVideoData.length + " geotagged video(s)",
            Object.keys(rawChannelMap).length + " channel(s)"
        ].join(", ");
    }

    function videoToHtml(video, options) {
        const thumbs = video?.snippet?.thumbnails || {};
        const thumbUrl = (thumbs?.medium || thumbs?.default || {url: "https://placehold.it/320x180"}).url;
        const videoId = video?.id || '';
        const videoTitle = video?.snippet?.title || '';
        const videoDescription = video?.snippet?.description || '';
        const publishDate = video?.snippet?.publishedAt;
        const publishedFromNow = publishDate ? publishDate + " (" + moment(publishDate).utc().fromNow() + ")" : '';
        const channelId = video?.snippet?.channelId || '';
        const channelTitle = video?.snippet?.channelTitle || '';
        const latitude = video?.recordingDetails?.location?.latitude;
        const longitude = video?.recordingDetails?.location?.longitude;
        const locationDescription = video?.recordingDetails?.locationDescription;
        const location = latitude ? latitude + ", " + longitude + (locationDescription ? "  ≡  " + locationDescription + "" : "") : "";

        const duration = moment.duration(video?.contentDetails?.duration);
        const length = duration.asMilliseconds();
        const hours = moment.duration(length).asHours() | 0 || 0;

        const videoLength = length === 0 ? 'live' :
            (hours > 0 ? hours + ":" : "") + moment.utc(length).format((hours > 0 ? "mm" : "m") + ":ss");

        const views = video?.statistics?.viewCount;
        const likes = video?.statistics?.likeCount;
        const properties = [
            views ? Number(views).toLocaleString() + " views" : "views disabled",
            likes ? Number(likes).toLocaleString() + " likes" : "likes disabled"
        ];
        const lang = video?.snippet?.defaultLanguage || video?.snippet?.defaultAudioLanguage;
        if (lang) {
            properties.push("lang:" + lang)
        }
        const dimension = video?.contentDetails?.dimension;
        const projection = video?.contentDetails?.projection;
        if (dimension === "3d") {
            properties.push(projection === "rectangular" ? "3d" : "360°");
        }
        const propertiesHtml = properties.length ?
            "<span class='tag'>" +
            properties.join("</span><span class='comma'>, </span><span class='tag'>") +
            "</span>"
            : "";

        const authorThumbs = rawChannelMap?.[channelId]?.snippet?.thumbnails || {};
        const authorThumbUrl = (authorThumbs.default || authorThumbs.medium ||
            {url: "https://placehold.it/" + options.authorThumbSize.width + "x" + options.authorThumbSize.height}).url;

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
            .replace(/{videoLength}/g, videoLength)
            .replace(/{publishDate}/g, publishedFromNow)
            .replace(/{channelId}/g, channelId)
            .replace(/{channelTitle}/g, channelTitle)
            .replace(/{authorThumb}/g, authorThumbUrl)
            .replace(/{location}/g, location)
            .replace(/{properties}/g, propertiesHtml)
    }

    function updateLocationCircle(e, dontFitBounds) {
        const radius = controls.radiusInput.val() || 15;
        const coords = e?.target?._lngLat || controls.locationMarker.getLngLat();

        if (coords) {
            controls.locationCircle = turf.circle([coords.lng, coords.lat], radius, {
                steps: 100, units: 'kilometers'
            });
            controls.map.getSource('circle').setData(controls.locationCircle);
        }
        if (pageType === LOCATION) {
            controls.locationMarker.addTo(controls.map);
        }
        if (!dontFitBounds && controls.locationCircle) {
            controls.map.fitBounds(turf.bbox(controls.locationCircle), {padding: 20});
        }
    }

    function getSafeRadiusValue() {
        let radius = Number(controls.radiusInput.val());
        if (!Number.isInteger(radius) || radius < 1) {
            radius = 1;
        }
        if (radius > 1000) {
            radius = 1000;
        }
        return radius;
    }

    function openInMap(videoId, focusOnSelect) {
        if (!popupMap.hasOwnProperty(videoId)) {
            console.log('Video does not have popup [%s]', videoId)
            return;
        }

        const popup = popupMap[videoId];
        const latLng = popup.latLng;

        const marker = coordsMap[latLng].marker;
        // console.log(marker);
        popup.setLngLat(marker.getLngLat()).addTo(controls.map);

        if (focusOnSelect) {
            setTimeout(function () {
                $(".type-marker." + videoId + " .multi select").focus().click();
            }, 50);
        }
    }

    function randomLocation() {
        const coords = swapCoords(shared.randomFromList(CITIES));
        controls.locationMarker.setLngLat(coords);
        updateLocationCircle();
        adjustToCircle();
    }

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

    function formatVideosToCSV(channelId) {
        //const fileName = channelId ? channelId : "geotags_all";
        //const mimeType = "data:text/csv;charset=utf-8";
        const headerColumns = ["channelId", "channelTitle", "videoId", "videoTitle",
            "videoDesc", "published", "latitude", "longitude", "locationDescription",
            "language"];
        const dataRows = [];

        function csvSanitize(textValue) {
            if (!textValue) {
                return "";
            }
            return encodeURI(textValue.replace(/#/g, '%23'))
                .replace(/%20/g, " ")
        }

        for (let videoId in popupMap) {
            const about = popupMap[videoId].about;
            if (!channelId || channelId === about.channelId) {
                const rowData = [
                    about.channelId,
                    csvSanitize(about.channelTitle),
                    about.videoId,
                    csvSanitize(about.videoTitle),
                    csvSanitize(about.videoDesc),
                    about.published,
                    about.position.lat,
                    about.position.lng,
                    csvSanitize(about.locationDescription),
                    csvSanitize(about.language)
                ];

                dataRows.push(rowData.join("\t"));
            }
        }

        return headerColumns.join("\t") + "\n" + dataRows.join("\n")
    }

    function adjustToResults() {
        console.log("adjustToResults");

        const coords = [];
        for (let key in coordsMap) {
            const marker = coordsMap[key].marker;
            coords.push(marker.getLngLat());
        }
        console.log(coords);

        if (!coords.length) {
            return;
        }

        const bounds = coords.reduce(function(bounds, coord) {
            return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coords[0], coords[0]));
        console.log(bounds);

        controls.map.fitBounds(bounds, {padding: 50});
    }
    function adjustToCircle() {
        console.log("adjustToCircle");
        controls.map.fitBounds(turf.bbox(controls.locationCircle), {padding: 25});
    }

    function clearResults() {
        uniqueVideoIds = {};
        rawVideoData = [];
        rawChannelMap = {};
        rawPlaylistMap = {};
        playlistMap = {};
        popupMap = {};
        coordsMap = {};
        shareUrls = [];
        absoluteShareUrls = [];

        for (let i = 0; i < markersList.length; i++) {
            const marker = markersList[i];

            marker.remove();
        }

        markersList.length = 0;
        languageResults = {}
        coordsMap = {}

        controls.geotagsTable.clear().draw();
    }

    function displayError(type, err) {
        const firstError = err?.responseJSON?.error?.errors?.[0];
        if (firstError) {
            if (firstError.reason === "quotaExceeded") {
                const html = "<strong>Quota Exceeded</strong> " +
                    "The daily API quota of 1,000,000 units has been reached for this application. " +
                    "This quota resets at midnight Pacific Time (PT) as per the Google Developers Console. " +
                    "See more detail here with <a target='_blank' href='https://github.com/mattwright324/youtube-geofind/issues/11' rel='noopener'>issue #11</a>.";

                displayMessage('alert-warning', html);
            } else {
                displayMessage('alert-warning', JSON.stringify(err));
            }
        }
    }

    function displayMessage(type, message) {
        const html =
            "<div class='alert " + type + " alert-dismissible fade show' role='alert'>" +
            message +
            "<button type='button' class='btn-close' data-bs-dismiss='alert' aria-label='Close'></button>" +
            "</div>";

        elements.alerts.append(html);
    }

    const internal = {
        init: function () {
            console.log('YouTube Geofind init [pageType=%s]', pageType);

            $("input[type='number']").inputSpinner();
            new ClipboardJS(".clipboard");

            let mapLoadResolve;
            const mapLoadPromise = new Promise(function (resolve) {
                mapLoadResolve = resolve;
            });

            controls.map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/streets-v12?optimize=true',
                center: swapCoords(randomCoords),
                zoom: 8,
            });
            controls.map.addControl(new mapboxgl.FullscreenControl());
            controls.map.addControl(new mapboxgl.NavigationControl());
            elements.mapLoading = $("#loading");
            controls.map.on('load', function () {
                elements.mapLoading.fadeOut(animationMs);

                controls.map.addSource('circle', {
                    'type': "geojson",
                    'data': null
                });
                controls.map.addLayer({
                    'id': 'circle-line',
                    'type': 'line',
                    'source': 'circle',
                    'paint': {
                        'line-color': '#00fff0',
                        'line-opacity': 0.5,
                    }
                });
                controls.map.addLayer({
                    'id': 'circle-fill',
                    'type': 'fill',
                    'source': 'circle',
                    'paint': {
                        'fill-color': '#00fff0',
                        'fill-opacity': 0.15,
                    }
                });

                if (pageType === LOCATION) {
                    updateLocationCircle();
                }

                $(".mapboxgl-ctrl-geolocate").remove();
                mapLoadResolve();
            });

            controls.channelInput = $("#channels");
            controls.locationInput = $("#address");
            controls.btnSearchInput = $("#searchAddress");
            controls.btnFindMe = $("#geolocate");
            controls.btnRandomLocation = $("#randomLocation");
            controls.radiusInput = $("#radius");
            controls.keywordsInput = $("#keywords");
            controls.btnRandomKeywords = $("#randomTopic");
            controls.comboTimeframe = $("#timeframe");
            elements.customRangeDiv = $(".customRange");
            controls.dateFromInput = $("#dateFrom");
            controls.dateToInput = $("#dateTo");
            controls.comboSortBy = $("#sortBy");
            controls.comboRelevanceLang = $("#relevanceLanguage");
            controls.comboSafeSearch = $("#safeSearch");
            controls.comboDuration = $("#videoDuration");
            controls.comboPageLimit = $("#pageLimit");
            controls.checkLive = $("#liveOnly");
            controls.checkCC = $("#creativeCommons");
            controls.checkHQ = $("#highQuality");
            controls.checkDimension3d = $("#dimension3d");
            controls.checkClearResults = $("#clearOnSearch");
            controls.checkAbsoluteTimeframe = $("#absoluteTimeframe");
            controls.btnSubmit = $("#submit");

            controls.btnExport = $("#export");
            controls.btnImport = $("#import");
            controls.importFileChooser = $("#importFileChooser");
            controls.shareLink = $("#shareLink");

            controls.comboTimeframe.change(function () {
                const value = controls.comboTimeframe.find(":selected").val();

                if (value === "custom") {
                    elements.customRangeDiv.show();
                } else {
                    elements.customRangeDiv.hide();
                }
            });
            controls.dateToInput.val(moment().format('yyyy-MM-DDT23:59'));

            controls.checkAbsoluteTimeframe.change(function () {
                if (controls.shareLink.val().length) {
                    updateSearchShareLink(false);
                }
            });

            const geolocate = new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: false
                },
                trackUserLocation: false,
                showUserLocation: false,
            });
            controls.map.addControl(geolocate);
            geolocate.on('geolocate', function (position) {
                console.log(position);

                controls.locationMarker.setLngLat([position?.coords?.longitude, position?.coords?.latitude])
                updateLocationCircle();
                adjustToCircle();
            });
            controls.btnFindMe.click(function () {
                if (!can.findMe) {
                    return;
                }
                localStorage.setItem(delayFindMeKey, new Date());
                countdownCheck(delayFindMeKey, controls.btnFindMe, delay15SecMs, "findMe");

                console.log('geolocate find me')

                geolocate.trigger();
            });

            controls.btnRandomLocation.click(function () {
                if (!can.randomLoc) {
                    return;
                }
                localStorage.setItem(delayRandomLocKey, new Date());
                countdownCheck(delayRandomLocKey, controls.btnRandomLocation, delay5SecMs, "randomLoc");

                console.log('random location');

                randomLocation();
            });

            const geocoder = new MapboxGeocoder({
                accessToken: mapboxgl.accessToken,
                mapboxgl: mapboxgl,
                marker: false,
                autocomplete: false,
            });
            geocoder.on('results', function(res) {
                const coords = res?.features?.[0]?.center;
                if (coords) {
                    controls.locationMarker.setLngLat(coords);
                    updateLocationCircle();
                    adjustToCircle();
                }
            })
            controls.map.addControl(geocoder);
            controls.btnSearchInput.click(function () {
                const locationText = controls.locationInput.val();
                if (!locationText.length) {
                    return;
                }
                if (!can.searchInput) {
                    return;
                }
                localStorage.setItem(delaySearchInputKey, new Date());
                countdownCheck(delaySearchInputKey, controls.btnSearchInput, delay15SecMs, "searchInput");

                console.log('search input');

                geocoder.query(locationText);
            });
            $(".mapboxgl-ctrl-geocoder").remove();
            controls.locationInput.on("keyup", function (event) {
                if (event.keyCode === KEY_ENTER) {
                    controls.btnSearchInput.click();
                }
            });

            controls.btnExport.on('click', function () {
                controls.btnExport.addClass("loading").addClass("disabled");

                const zip = new JSZip();
                console.log("Creating about.txt...")
                zip.file("about.txt",
                    "Downloaded by YouTube Geofind " + new Date().toLocaleString() + "\n\n" +
                    "URL: " + window.location + "\n\n" +
                    (shareUrls.length > 0 ? "Share url(s): " + JSON.stringify(shareUrls, null, 4) + "\n\n"
                        : "") +
                    (absoluteShareUrls.length > 0 ?
                        "Share url(s) absolute timeframe: " + JSON.stringify(absoluteShareUrls, null, 4)
                        : "")
                );

                console.log("Creating videos.json...")
                zip.file("videos.json", JSON.stringify(rawVideoData));

                console.log("Creating channels.json...")
                const rawChannelData = [];
                for (let id in rawChannelMap) {
                    rawChannelData.push(rawChannelMap[id]);
                }
                zip.file("channels.json", JSON.stringify(rawChannelData));

                console.log("Creating geotags.csv...")
                zip.file("geotags.csv", formatVideosToCSV());

                const fileName = shared.safeFileName("geofind_" + pageType + " (" + rawVideoData.length + " videos).zip");

                console.log("Saving as " + fileName);
                zip.generateAsync({
                    type: "blob",
                    compression: "DEFLATE",
                    compressionOptions: {
                        level: 9
                    }
                }).then(function (content) {
                    saveAs(content, fileName);

                    controls.btnExport.removeClass("loading").removeClass("disabled");
                });
            });

            // Drag & Drop listener
            document.addEventListener("dragover", function(event) {event.preventDefault();});
            document.documentElement.addEventListener('drop', async function (e) {
                e.stopPropagation();
                e.preventDefault();

                let file = e.dataTransfer.files[0];
                console.log("Loading file");
                console.log(file);

                importFile(file);
            });

            controls.importFileChooser.on('change', function (event) {
                console.log(event);

                let file = event.target.files[0];

                if (file) {
                    if (internal.pageType === pageTypes.CHANNEL) {
                        controls.inputChannels.val(file.name);
                    }
                } else {
                    return;
                }

                importFile(file);
            });

            function importFile(file) {
                console.log("Importing from file " + file.name);

                controls.btnImport.addClass("loading").addClass("disabled");
                clearResults();

                controls.progress.update({
                    text: '',
                    subtext: 'Importing file',
                    value: 2,
                    max: 5
                });

                function loadZipFile(fileName, process, onfail) {
                    return new Promise(function (resolve, reject) {
                        console.log('loading ' + fileName);

                        JSZip.loadAsync(file).then(function (content) {
                            // if you return a promise in a "then", you will chain the two promises
                            return content.file(fileName).async("string");
                        }).then(function (text) {
                            process(text);

                            resolve();
                        }).catch(function (err) {
                            console.warn(err);
                            console.warn(fileName + ' not in imported file');
                            if (onfail) {
                                onfail()
                                reject()
                            } else {
                                resolve()
                            }
                        });
                    })
                }

                loadZipFile("channels.json", function (text) {
                    const channels = JSON.parse(text);
                    if (Array.isArray(channels)) {
                        channels.forEach(function (channel) {
                            rawChannelMap[channel.id] = channel;
                        })
                    } else {
                        rawChannelMap = channels;
                    }
                }).then(function () {
                    return loadZipFile("videos.json", function (text) {
                        const data = JSON.parse(text);
                        data.forEach(function (video) {
                            if (internal.doesVideoHaveLocation(video) && !uniqueVideoIds.hasOwnProperty(video.id)) {
                                rawVideoData.push(video);
                                uniqueVideoIds[video.id] = {loaded: false};
                            }
                        })
                    }, function () {
                        controls.progress.update({
                            value: 0,
                            max: 5,
                            subtext: 'Import failed (no videos.json)'
                        });

                        controls.btnImport.removeClass("loading").removeClass("disabled");
                    })
                }).then(function () {
                    return handleNewChannelIds();
                }).then(function () {
                    rawVideoData.forEach(function (video) {
                        internal.pushVideo(video);
                    });

                    controls.progress.update({
                        value: 5,
                        max: 5,
                        text: doneProgressMessage(),
                        subtext: 'Import done'
                    });

                    adjustToResults();

                    controls.btnImport.removeClass("loading").removeClass("disabled");
                });
            }

            let contextMenuEvent;
            controls.map.on('contextmenu', function (e) {
                contextMenuEvent = e;
            });
            const contextMenu = {};
            if (pageType === LOCATION) {
                contextMenu.moveMarker = {name: "Move marker here", icon: "bi bi-geo-fill"};
                // contextMenu.searchHere = {name: "Search here", icon: "bi bi-search"};
            }
            contextMenu.adjustToResults = {name: "Adjust to results", icon: "bi bi-square"};
            if (pageType === LOCATION) {
                contextMenu.adjustToCircle = {name: "Adjust to location circle", icon: "bi bi-circle"};
            }
            const menuActions = {
                moveMarker: function () {
                    console.log("moveMarker");

                    controls.locationMarker.setLngLat(contextMenuEvent.lngLat);
                    updateLocationCircle();
                },
                adjustToResults: adjustToResults,
                adjustToCircle: adjustToCircle
            }

            $.contextMenu({
                selector: "#map",
                callback: function (key, options) {
                    if (menuActions.hasOwnProperty(key)) {
                        menuActions[key]();
                    }
                },
                animation: {duration: 5, show: 'fadeIn', hide: 'fadeOut'},
                items: contextMenu
            });

            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl)
            })

            countdownCheck(delaySubmitKey, controls.btnSubmit, delay15SecMs, "submit");
            countdownCheck(delayRandomLocKey, controls.btnRandomLocation, delay5SecMs, "randomLoc");
            countdownCheck(delayFindMeKey, controls.btnFindMe, delay15SecMs, "findMe");
            countdownCheck(delaySearchInputKey, controls.btnSearchInput, delay15SecMs, "searchInput");

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
                lengthMenu: [[10, 25, 50, 100, 250, -1], [10, 25, 50, 100, 250, "All"]],
                ordering: false,
                deferRender: true,
                bDeferRender: true,
            });
            controls.geotagsTable.on('page.dt', function () {
                $('html, body').animate({
                    scrollTop: $('#geotagsTable_wrapper').offset().top
                }, 'slow');
            });
            $("div#langFilterContainer").html(
                "Language: " +
                "<select id='langFilter' class='form-select form-select-sm' style='display:inline; width:auto;'>" +
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

            controls.progress = $("#progressBar");
            elements.progressText = $("#progressText")
            controls.progress.progressData = {
                min: 0,
                value: 0,
                max: 100
            }
            controls.progress.update = function (options) {
                console.log(options)
                if (String(options["reset"]).toLowerCase() === "true") {
                    console.log('reset')
                    this.update({
                        min: 0,
                        value: 0,
                        max: 100,
                        text: "",
                        subtext: 'Idle'
                    });
                    return;
                }
                if (options.hasOwnProperty("subtext")) {
                    elements.progressText.text(options.subtext);
                }
                if (options.hasOwnProperty("text")) {
                    this.find('.label').text(options.text);
                }
                if (options.hasOwnProperty("min")) {
                    this.progressData.min = options.min;
                }
                if (options.hasOwnProperty("value")) {
                    this.progressData.value = options.value;
                }
                if (options.hasOwnProperty("max")) {
                    this.progressData.max = options.max;
                }

                const data = this.progressData;
                const percent = 100 * ((data.value - data.min) / (data.max - data.min));
                this.css('width', percent + "%");
            };

            controls.btnRandomKeywords.click(function () {
                controls.keywordsInput.val(shared.randomFromList(TOPICS));
            });

            if (pageType === TOPIC) {
                controls.btnRandomKeywords.click();
            }
            if (pageType === CHANNEL) {
                controls.channelInput.val(shared.randomFromList(CHANNELS));
            }

            controls.locationMarker = new mapboxgl.Marker({
                draggable: true
            }).setLngLat(swapCoords(randomCoords));

            controls.locationMarker.on('drag', function (e) {
                updateLocationCircle(e, true);
            });
            controls.locationMarker.on('dragend', function (e) {
                updateLocationCircle(e);
            });
            controls.radiusInput.on('input', function () {
                updateLocationCircle();
            });
            controls.radiusInput.on('change', function () {
                updateLocationCircle();
            });

            if (pageType === CHANNEL) {
                controls.btnSubmit.on('click', internal.submitChannel)
            } else {
                controls.btnSubmit.on('click', internal.submit);
            }

            mapLoadPromise.then(function () {
                updatePageFromQuery();
            })
        },

        doesVideoHaveLocation: function (video) {
            return video?.recordingDetails?.location?.latitude;
        },

        locationToPosition: function (video) {
            const location = video?.recordingDetails?.location;
            return {
                lat: location.latitude,
                lng: location.longitude
            }
        },

        getLanguage: function (video) {
            const snippet = video.snippet || {};
            return snippet.defaultLanguage || snippet.defaultAudioLanguage;
        },

        /**
         * Topic and Location submit
         */
        submit: function () {
            if (!can.submit) {
                return;
            }
            localStorage.setItem(delaySubmitKey, new Date());
            countdownCheck(delaySubmitKey, controls.btnSubmit, delay15SecMs, "submit");

            console.log('Submit');

            if (controls.checkClearResults.is(":checked")) {
                clearResults();
            }
            updateSearchShareLink(true);

            const params = {
                part: "id",
                maxResults: 50,
                type: "video",
                q: controls.keywordsInput.val(),
                timeframe: controls.comboTimeframe.find(":selected").val(),
                safeSearch: controls.comboSafeSearch.find(":selected").val(),
                order: controls.comboSortBy.find(":selected").val(),
                videoDuration: controls.comboDuration.find(":selected").val(),
            };
            if (pageType === LOCATION) {
                params.locationRadius = getSafeRadiusValue() * 1000 + "m";
                const pos = controls.locationMarker.getLngLat();
                params.location = pos.lat + "," + pos.lng;
            }
            if (params.timeframe !== 'any') {
                let dateFrom = new Date();
                let dateTo = new Date();

                if (params.timeframe === "custom") {
                    dateFrom = new Date(controls.dateFromInput.val());
                    dateTo = new Date(controls.dateToInput.val());
                } else {
                    dateFrom.setTime(dateTo.getTime() - timeMs[params.timeframe]);
                }

                params.publishedAfter = dateFrom.toISOString();
                params.publishedBefore = dateTo.toISOString();

                delete params.timeframe;
            }
            const lang = controls.comboRelevanceLang.find(":selected").val();
            if (lang !== 'any') {
                params.relevanceLanguage = lang;
            }
            if (controls.checkLive.is(":checked")) {
                params.eventType = "live";
            }
            if (controls.checkCC.is(":checked")) {
                params.videoLicense = "creativecommon";
            }
            if (controls.checkHQ.is(":checked")) {
                params.videoDefinition = "high";
            }
            if (controls.checkDimension3d.is(":checked")) {
                params.videoDimension = "3d";
            }

            let maxPages = Number(controls.comboPageLimit.find(":selected").val());
            if (!Number.isInteger(maxPages) || maxPages < 1) {
                maxPages = 1;
            }
            if (maxPages > 5) {
                maxPages = 5;
            }

            console.log("maxPages=%s params=%s", maxPages, JSON.stringify(params));

            controls.progress.update({
                value: 1,
                max: 1,
                text: '0',
                subtext: 'Searching'
            });

            elements.mapLoading.show();
            handleSearch(maxPages, params).then(function (videoIds) {
                return handleVideoIds(videoIds);
            }).then(function () {
                return handleNewChannelIds();
            }).then(function () {
                controls.progress.update({
                    value: 1,
                    max: 1,
                    text: doneProgressMessage(),
                    subtext: 'Done'
                });

                rawVideoData.forEach(function (video) {
                    internal.pushVideo(video);
                });

                console.log(popupMap);
                console.log(coordsMap)

                adjustToResults();

                elements.mapLoading.fadeOut();
            }).catch(function (err) {
                console.error(err);

                displayError("alert-warning", err);

                elements.mapLoading.fadeOut();
            });
        },

        /**
         * Channel submit
         */
        submitChannel: function () {
            if (!can.submit) {
                return;
            }
            localStorage.setItem(delaySubmitKey, new Date());
            countdownCheck(delaySubmitKey, controls.btnSubmit, delay15SecMs, "submit");

            console.log('Channel Submit');

            clearResults();
            updateChannelShareLink(true);

            const parsed = [];
            controls.channelInput.val().split(",").forEach(function (part) {
                parsed.push(shared.determineInput(part.trim()));
            });
            console.log(parsed);

            const channelVanities = [];
            const channelIds = [];
            const channelIdsCreatedPlaylists = [];
            const playlistIds = [];
            const videoIds = [];

            parsed.forEach(function (p) {
                if (p.type === 'video_id' && videoIds.indexOf(p.value) === -1) {
                    videoIds.push(p.value);

                    controls.progress.update({
                        text: videoIds.length
                    });
                } else if (p.type === "playlist_id" && playlistIds.indexOf(p.value) === -1) {
                    playlistIds.push(p.value);
                } else if (p.type === "channel_id" && channelIds.indexOf(p.value) === -1) {
                    channelIds.push(p.value);
                } else if (p.type === "channel_handle" && channelVanities.indexOf(p.original) === -1) {
                    channelVanities.push(p.original);
                } else if (p.type === "channel_custom" && channelVanities.indexOf(p.original) === -1) {
                    channelVanities.push(p.original);
                } else if (p.type === "channel_user" && channelVanities.indexOf(p.original) === -1) {
                    channelVanities.push(p.original);
                }
            });

            controls.progress.update({
                subtext: 'Grabbing unique video ids'
            });

            handleChannelVanities(channelVanities, channelIds).then(function () {
                return handleChannelIds(channelIds, playlistIds, channelIdsCreatedPlaylists);
            }).then(function () {
                // Grab playlist names
                return handlePlaylistNames(playlistIds);
            }).then(function () {
                // Playlists condense to video ids
                return handlePlaylistIds(playlistIds, videoIds);
            }).then(function () {
                controls.progress.update({
                    subtext: 'Processing video ids'
                });

                // Videos are results to be displayed
                return handleVideoIds(videoIds);
            }).then(function () {
                return new Promise(function (resolve) {
                    rawVideoData.forEach(function (video) {
                        internal.pushVideo(video);
                    });
                    resolve();
                });
            }).then(function () {
                controls.progress.update({
                    subtext: 'Processing channel ids'
                });

                // Ids for channels not in the original request, likely from playlists
                const newChannelIds = [];
                rawVideoData.forEach(function (video) {
                    const channelId = video?.snippet?.channelId;
                    if (!rawChannelMap.hasOwnProperty(channelId) && newChannelIds.indexOf(channelId) === -1) {
                        newChannelIds.push(channelId);
                    }
                });

                return handleNewChannelIds(newChannelIds, [], []);
            }).then(function () {
                console.log(videoIds);

                adjustToResults();

                controls.progress.update({
                    value: 1,
                    max: 1,
                    text: doneProgressMessage(),
                    subtext: 'Done'
                });
            }).catch(function (err) {
                console.error(err);

                displayError("alert-warning", err);

                elements.loadingDiv.fadeOut();
            });
        },

        updateLanguageDropdown: function (video) {
            // Add lang to map, update counts
            const beforeLanguageCount = Object.keys(languageResults).length;
            const lang = internal.getLanguage(video);
            languageResults[lang] = ++languageResults[lang] || 1;
            const afterLanguageCount = Object.keys(languageResults).length;
            const totalResults = Object.values(languageResults).reduce((total, langNum) => total + langNum);

            if (beforeLanguageCount !== afterLanguageCount) {
                // Rebuild html if new languages present, sort languages
                languageResults = sortObject(languageResults);

                $("#langFilter")
                    .html("<option selected value='' data-lang='all'>All (" + totalResults + ")</option>");

                Object.keys(languageResults).forEach(lang => {
                    $("#langFilter").append(
                        "<option value='" + lang + "' data-lang='" + lang + "'>" +
                        String(lang) + " (" + languageResults[lang] + ")" +
                        "</option>");
                });
            } else {
                // Otherwise just update count of existing language for this video
                $("option[data-lang='all']").text("All (" + totalResults + ")");
                $("option[data-lang='" + lang + "']").text(lang + " (" + languageResults[lang] + ")")
            }
        },

        pushVideo: function (video) {
            if (!internal.doesVideoHaveLocation(video)) {
                return;
            }

            const videoId = video?.id;
            if (uniqueVideoIds.hasOwnProperty(videoId) && uniqueVideoIds[videoId].loaded === true) {
                return;
            }
            if (uniqueVideoIds.hasOwnProperty(videoId) && uniqueVideoIds[videoId].loaded === false) {
                uniqueVideoIds[videoId] = {loaded: true};
            }
            if (!uniqueVideoIds.hasOwnProperty(videoId)) {
                uniqueVideoIds[videoId] = {loaded: true};
                rawVideoData.push(video);
            }
            const position = internal.locationToPosition(video);
            // Combine very close yet slightly different coordinates into same marker group
            // 4 decimal precision ~ 10 meter area
            const latLng = "[" +
                String(position.lat).substr(0, String(position.lat).lastIndexOf('.') + 5) + "," +
                String(position.lng).substr(0, String(position.lat).lastIndexOf('.') + 5) + "]";
            const channelId = video.snippet.channelId;

            const markerPopup = new mapboxgl.Popup({offset: 25}).setHTML(
                videoToHtml(video, {
                    type: "marker",
                    videoThumbSize: {
                        width: 200,
                        height: 112
                    },
                    authorThumbSize: {
                        width: 18,
                        height: 18
                    }
                })
            );
            markerPopup.latLng = latLng;
            markerPopup.about = {
                channelId: channelId,
                channelTitle: video?.snippet?.channelTitle,
                thumbLoaded: false,

                videoId: videoId,
                videoTitle: video?.snippet?.title,
                videoDesc: video?.snippet?.description,
                published: video?.snippet?.publishedAt,
                locationDescription: video?.recordingDetails?.locationDescription,
                language: String(internal.getLanguage(video)),
                position: position
            }
            popupMap[videoId] = markerPopup;
            markerPopup.on('open', () => {
                let count = 0;
                for (let latLng in coordsMap) {
                    if (coordsMap[latLng].videoIds.indexOf(videoId) >= 0) {
                        count = coordsMap[latLng].videoIds.length;
                        break;
                    }
                }

                if (count <= 1) {
                    return;
                }

                let options = [];
                let popups = [];
                coordsMap[latLng].videoIds.forEach(function (id) {
                    popups.push(popupMap[id]);
                })
                popups.sort(function (a, b) {
                    return String(a.about.videoTitle).toLowerCase() > String(b.about.videoTitle).toLowerCase()
                });
                for (let i = 0; i < popups.length; i++) {
                    const markerId = popups[i].about.videoId;
                    const selected = videoId === markerId ? " selected" : "";
                    options.push("<option value='" + markerId + "'" + selected + ">" + popups[i].about.videoTitle.trunc(30) + "</option>");
                }

                const html =
                    "<span style='margin-bottom:10px;'>" +
                    "<select style='max-width: 300px' class='form-select form-select-sm '>" +
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
                    popupMap[videoId].remove();
                    openInMap(selectedVideo, true);
                });
            });

            if (!coordsMap.hasOwnProperty(latLng)) {
                const channelId = video.snippet.channelId;
                const firstChar = (video?.snippet?.channelTitle || "").charAt(0);
                const defaultThumb = "https://dummyimage.com/50x50/aaaaaa/fff.png&text=" + firstChar;
                const authorThumbs = rawChannelMap?.[channelId]?.snippet?.thumbnails || {};
                const authorThumbUrl = (authorThumbs.default || authorThumbs.medium ||
                    {url: defaultThumb}).url;

                const el = document.createElement('div');
                el.className = 'marker';
                el.style.backgroundImage = "url(" + defaultThumb + ")"
                el.style.backgroundSize = '20px';
                el.style.width = '20px';
                el.style.height = '20px';

                const videoMarker = new mapboxgl.Marker(el)
                    .setLngLat([position.lng, position.lat])
                    .addTo(controls.map);

                videoMarker.setPopup(markerPopup);

                markersList.push(videoMarker);

                coordsMap[latLng] = {
                    marker: videoMarker,
                    videoIds: [videoId]
                };

                // delay retrieving images by milliseconds
                // fixes 403 (rate limits) when loading profile pictures locally
                const image = new Image();
                image.onload = function () {
                    videoMarker._element.style.backgroundImage = "url(" + authorThumbUrl + ")"
                }
                image.onerror = function () {
                    console.warn("Thumb failed to load, using default placeholder");
                }
                setTimeout(function () {
                    image.src = authorThumbUrl;
                }, Object.keys(coordsMap).length / 25)
            }
            if (coordsMap[latLng].videoIds.indexOf(videoId) === -1) {
                coordsMap[latLng].videoIds.push(videoId);
            }

            // Push to list
            const listItemHtml = videoToHtml(video, {
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
            controls.geotagsTable.row.add([0, listItemHtml, String(video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage)]).draw();
            internal.updateLanguageDropdown(video);
        }
    }

    const defaultParams = {
        radius: 25,
        pages: 3,
        keywords: '',
        timeframe: 'any',
        duration: 'any',
        safeSearch: 'moderate',
        relevanceLanguage: 'any',
        sort: 'date',
        live: false,
        creativeCommons: false,
        hq: false,
        "3d": false
    }
    function buildShareLink(absolute) {
        const params = {};
        if (controls.locationInput.length) {
            const markerPosition = controls.locationMarker.getLngLat();

            params["location"] = markerPosition.lat + "," + markerPosition.lng;
            params["radius"] = getSafeRadiusValue();
        }
        params["keywords"] = controls.keywordsInput.val();
        params["timeframe"] = controls.comboTimeframe.find(":selected").val();
        if (params.timeframe !== "any") {
            let dateFrom = new Date();
            let dateTo = new Date();

            if (params.timeframe === "custom") {
                dateFrom = new Date(controls.dateFromInput.val());
                dateTo = new Date(controls.dateToInput.val());
            } else {
                dateFrom.setTime(dateTo.getTime() - timeMs[params.timeframe]);
            }

            params["start"] = dateFrom.toISOString();
            params["end"] = dateTo.toISOString();
        }
        const lang = controls.comboRelevanceLang.find(":selected").val();
        if (lang !== 'any') {
            params["relevanceLanguage"] = lang;
        }
        params["safeSearch"] = controls.comboSafeSearch.find(":selected").val();
        params["sort"] = controls.comboSortBy.find(":selected").val();
        params["duration"] = controls.comboDuration.find(":selected").val();
        let pages = Number(controls.comboPageLimit.find(":selected").val());
        if (!Number.isInteger(pages) || pages < 1) {
            pages = 1;
        }
        if (pages > 5) {
            pages = 5;
        }
        params["pages"] = pages;
        if (controls.checkLive.is(":checked")) {
            params["live"] = true;
        }
        if (controls.checkCC.is(":checked")) {
            params["creativeCommons"] = true;
        }
        if (controls.checkHQ.is(":checked")) {
            params["hq"] = true;
        }
        if (controls.checkDimension3d.is(":checked")) {
            params["3d"] = true;
        }

        if (params.hasOwnProperty("timeframe")) {
            if (!absolute && params.timeframe !== 'custom') {
                // relative time should not show calculated timestamps
                delete params["start"];
                delete params["end"];
            } else if (absolute && params.timeframe !== 'any' && params.timeframe !== 'custom') {
                params["timeframeWas"] = params.timeframe;
                params.timeframe = "custom";
            }
        }

        const linkParams = [];
        for (let key in params) {
            if (defaultParams.hasOwnProperty(key) && defaultParams[key] === params[key]) {
                continue;
            }
            linkParams.push(key + "=" + encodeURIComponent(params[key]));
        }
        linkParams.push("doSearch=true");

        return location.origin + location.pathname + "?" + linkParams.join("&").replace("%2C", ",");
    }

    function updateChannelShareLink(pushLinks) {
        const link = location.origin + location.pathname +
            "?channels=" + encodeURIComponent(controls.channelInput.val()) + "&doSearch=true";

        if (pushLinks) {
            shareUrls.push(link);
        }

        controls.shareLink.val(link);
    }

    function updateSearchShareLink(pushLinks) {
        const absolute = controls.checkAbsoluteTimeframe.is(":checked");

        if (pushLinks) {
            const share = buildShareLink(false);
            shareUrls.push(share);
            const shareAbsolute = buildShareLink(true);
            if (share !== shareAbsolute) {
                absoluteShareUrls.push(shareAbsolute);
            }
        }

        controls.shareLink.val(buildShareLink(absolute));
        controls.shareLink.attr("disabled", false);
    }

    function handleSearch(maxPages, queryParams) {
        return new Promise(function (resolve) {
            const results = [];

            function doSearch(page, token) {
                console.log("page " + page);

                youtube.ajax("search", $.extend({pageToken: token}, queryParams)).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (item) {
                        const videoId = item?.id?.videoId;
                        if (videoId && results.indexOf(videoId) === -1) {
                            results.push(videoId);
                        }
                    });

                    controls.progress.update({
                        value: 1,
                        max: 1,
                        text: results.length,
                        subtext: 'Searching'
                    });

                    if (res.hasOwnProperty("nextPageToken") && page < maxPages) {
                        setTimeout(function () {
                            doSearch(page + 1, res.nextPageToken);
                        }, apiNextPageMs);
                    } else {
                        resolve(results);
                    }
                }).fail(function (err) {
                    console.log(err);
                    resolve(results);
                });
            }

            doSearch(1, "");
        });
    }

    function handleVideoIds(videoIds) {
        let processed = 0;

        const newVideoIds = [];
        videoIds.forEach(function (videoId) {
            if (!uniqueVideoIds.hasOwnProperty(videoId)) {
                newVideoIds.push(videoId);
            }
        })

        return new Promise(function (resolve) {
            if (videoIds.length === 0) {
                console.log("no videoIds")
                resolve();
                return;
            }

            controls.progress.update({
                value: processed,
                max: videoIds.length,
                text: processed + " / " + videoIds.length,
                subtext: 'Processing video ids'
            })

            console.log("checking " + newVideoIds.length + " videoIds");

            function get(index, slice) {
                if (index >= newVideoIds.length) {
                    console.log("finished videoIds");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                console.log("handleVideoIds.get(" + index + ", " + (index + slice) + ")")

                const ids = newVideoIds.slice(index, index + slice);

                console.log(ids.length);
                console.log(ids);

                youtube.ajax("videos", {
                    part: "snippet,statistics,recordingDetails," +
                        "status,liveStreamingDetails,localizations," +
                        "contentDetails,topicDetails",
                    maxResults: 50,
                    id: ids.join(",")
                }).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (video) {
                        if (internal.doesVideoHaveLocation(video) && !uniqueVideoIds.hasOwnProperty(video.id)) {
                            uniqueVideoIds[video.id] = {
                                loaded: false
                            };
                            rawVideoData.push(video);
                        }
                    });

                    processed = processed + ids.length;

                    controls.progress.update({
                        value: processed,
                        max: newVideoIds.length,
                        text: processed + " / " + newVideoIds.length
                    })

                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                }).fail(function (err) {
                    console.error(err);
                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                });
            }

            get(0, 50);
        });
    }

    function handleNewChannelIds() {
        let processed = 0;

        const newChannelIds = [];
        rawVideoData.forEach(function (video) {
            const channelId = video?.snippet?.channelId;

            if (!rawChannelMap.hasOwnProperty(channelId) && newChannelIds.indexOf(channelId) === -1) {
                newChannelIds.push(channelId);
            }
        });

        return new Promise(function (resolve) {
            if (newChannelIds.length === 0) {
                console.log("no channelIds")
                resolve();
                return;
            }

            controls.progress.update({
                value: 0,
                max: newChannelIds.length,
                text: "0 / " + newChannelIds.length,
                subtext: 'Processing channel ids'
            });

            function get(index, slice) {
                if (index >= newChannelIds.length) {
                    console.log("finished channelIds");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                console.log("handleChannelIds.get(%s, %s)", index, slice)

                const ids = newChannelIds.slice(index, index + slice);

                youtube.ajax("channels", {
                    part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails",
                    id: ids.join(","),
                    maxResults: 50
                }).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (channel) {
                        rawChannelMap[channel.id] = channel;
                    });

                    processed = processed + ids.length;

                    controls.progress.update({
                        value: processed,
                        text: processed + " / " + newChannelIds.length
                    });

                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                }).fail(function (err) {
                    console.error(err);
                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                });
            }

            get(0, 50);
        });
    }

    function updatePageFromQuery() {
        parseQuery(window.location.search);
    }
    function parseQuery(query) {
        const pairs = (query[0] === '?' ? query.substr(1) : query).split('&');
        const parsedQuery = {};
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            parsedQuery[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
        }

        handleBasicQueryParams(parsedQuery).then(function () {
            return handleLocationQueryParams(parsedQuery);
        }).then(function () {
            if (parsedQuery.doSearch === "true") {
                console.log('attempting doSearch (if button not disabled)')
                controls.btnSubmit.click();
            }
        });
    }
    function handleBasicQueryParams(parsedQuery) {
        return new Promise(function (resolve) {
            console.log('parsing query params')
            console.log(parsedQuery);

            // Channels page
            if (parsedQuery.channels && controls.channelInput) {
                controls.channelInput.val(parsedQuery.channels);
            }

            // Topics & Location pages
            if (parsedQuery.radius && controls.radiusInput.length) {
                controls.radiusInput.val(parsedQuery.radius);
                controls.radiusInput.trigger('change');
            }
            if (parsedQuery.keywords && controls.keywordsInput.length) {
                controls.keywordsInput.val(parsedQuery.keywords);
            }
            if (parsedQuery.safeSearch && controls.comboSafeSearch.length) {
                controls.comboSafeSearch.val(parsedQuery.safeSearch);
                controls.comboSafeSearch.trigger('change');
            }
            if (parsedQuery.relevanceLanguage && controls.comboRelevanceLang.length) {
                controls.comboRelevanceLang.val(parsedQuery.relevanceLanguage);
                controls.comboRelevanceLang.trigger('change');
            }
            if (parsedQuery.sort && controls.comboSortBy.length) {
                controls.comboSortBy.val(parsedQuery.sort);
                controls.comboSortBy.trigger('change');
            }
            if (parsedQuery.duration && controls.comboDuration.length) {
                controls.comboDuration.val(parsedQuery.duration);
                controls.comboDuration.trigger('change');
            }
            if (parsedQuery.timeframe && $("#timeframe option[value='" + parsedQuery.timeframe + "']").length) {
                controls.comboTimeframe.val(parsedQuery.timeframe);
                controls.comboTimeframe.trigger('change');
            }
            const rfcStart = moment(parsedQuery.start).utcOffset(0, true).format(RFC_3339);
            if (parsedQuery.start && controls.comboTimeframe.length) {
                controls.dateFromInput.val(rfcStart);
            }
            const rfcEnd = moment(parsedQuery.end).utcOffset(0, true).format(RFC_3339);
            if (parsedQuery.end && controls.comboTimeframe.length) {
                controls.dateToInput.val(rfcEnd);
            }
            if (parsedQuery.live && controls.checkLive.length) {
                controls.checkLive.prop("checked", parsedQuery.live === "true");
            }
            if (parsedQuery.creativeCommons && controls.checkCC.length) {
                controls.checkCC.prop("checked", parsedQuery.creativeCommons === "true");
            }
            if (parsedQuery.hq && controls.checkHQ.length) {
                controls.checkHQ.prop("checked", parsedQuery.hq === "true");
            }
            if (parsedQuery["3d"] && controls.checkDimension3d.length) {
                controls.checkDimension3d.prop("checked", parsedQuery["3d"] === "true");
            }
            if (parsedQuery.pages && controls.comboPageLimit.length) {
                controls.comboPageLimit.val(parsedQuery.pages);
                controls.comboPageLimit.trigger('change');
            }

            resolve();
        });
    }
    function handleLocationQueryParams(parsedQuery) {
        return new Promise(function (resolve) {
            try {
                if (parsedQuery.location) {
                    console.log('handling location param')

                    const parts = parsedQuery.location.split(",");
                    if (parts.length === 2) {
                        controls.locationMarker.setLngLat(swapCoords([Number(parts[0]), Number(parts[1])]))
                        updateLocationCircle();
                        adjustToCircle();
                    }
                    resolve();
                } else if (parsedQuery.locationAddress) {
                    console.log('handling locationAddress param')

                    // Unsupported
                    resolve();
                } else {
                    resolve();
                }
            } catch (e) {
                console.warn(e);
                resolve();
            }
        });
    }

    function handleChannelVanities(channelVanities, channelIds) {
        return new Promise(function(resolve) {
            if (channelVanities.length === 0) {
                console.log("no channelVanities")
                resolve();
                return;
            }

            function get(index) {
                if (index >= channelVanities.length) {
                    console.log("finished channelVanities");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                console.log("handleChannelVanities.get(" + index + ")")

                $.ajax({
                    url: "https://ytapi.apps.mattw.io/v1/resolve_url",
                    dataType: "json",
                    data: {url: channelVanities[index]}
                }).then(function(res) {
                    const newParsed = shared.determineInput(res.channelId);
                    if (newParsed.type === "channel_id") {
                        channelIds.push(newParsed.value);
                        setTimeout(function () {
                            get(index + 1);
                        }, apiNextPageMs);
                    } else {
                        console.log('Could not resolve custom url');
                        console.warn(newParsed);

                        setTimeout(function () {
                            get(index + 1);
                        }, apiNextPageMs);
                    }
                }).fail(function (err) {
                    console.warn(err);

                    setTimeout(function () {
                        get(index + 1);
                    }, apiNextPageMs);
                });
            }

            get(0);
        })
    }

    function handleChannelIds(channelIds, playlistIds, channelIdsCreatedPlaylists) {
        let processed = 0;
        channelIds.forEach(function (channelId) {
            if (channelIdsCreatedPlaylists.indexOf(channelId) === -1) {
                channelIdsCreatedPlaylists.push(channelId);
            }
        });
        return new Promise(function (resolve) {
            if (channelIds.length === 0) {
                console.log("no channelIds")
                resolve();
                return;
            }

            controls.progress.update({
                value: 0,
                max: channelIds.length,
                text: "0 / " + channelIds.length
            });

            function get(index, slice) {
                if (index >= channelIds.length) {
                    console.log("finished channelIds");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                console.log("handleChannelIds.get(%s, %s)", index, slice)

                const ids = channelIds.slice(index, index + slice);

                youtube.ajax("channels", {
                    part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails",
                    id: ids.join(","),
                    maxResults: 50
                }).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (channel) {
                        const channelId = channel?.id;
                        rawChannelMap[channelId] = channel;

                        const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
                        console.log(uploadsPlaylistId);

                        if (playlistIds.indexOf(uploadsPlaylistId) === -1) {
                            playlistIds.push(uploadsPlaylistId);
                        }
                    });

                    processed = processed + ids.length;

                    controls.progress.update({
                        value: processed,
                        text: processed + " / " + channelIds.length
                    });

                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                }).fail(function (err) {
                    console.error(err);
                    setTimeout(function () {
                        get(index + slice, slice);
                    }, apiNextPageMs);
                });
            }

            get(0, 50);
        });
    }


    function handlePlaylistNames(playlistIds) {
        return new Promise(function (resolve) {
            if (playlistIds.length === 0) {
                console.log("no playlistIds")
                resolve();
                return;
            }

            const notYetRetrieved = [];
            playlistIds.forEach(function (id) {
                if (!playlistMap.hasOwnProperty(id)) {
                    notYetRetrieved.push(id);
                }
            });
            console.log(notYetRetrieved);

            function get(index) {
                if (index >= notYetRetrieved.length) {
                    console.log("finished notYetRetrieved");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                console.log("handlePlaylistNames.get(%s)")

                function paginate(pageToken) {
                    console.log(pageToken);
                    youtube.ajax("playlists", {
                        part: "snippet,status,localizations,contentDetails",
                        maxResults: 50,
                        id: notYetRetrieved[index],
                        pageToken: pageToken
                    }).done(function (res) {
                        console.log(res);

                        (res.items || []).forEach(function (playlist) {
                            const playlistId = playlist?.id;
                            console.log(playlistId);

                            rawPlaylistMap[playlistId] = playlist;
                            playlistMap[playlistId] = playlist?.snippet?.title;
                        });

                        if (res.hasOwnProperty("nextPageToken")) {
                            paginate(res.nextPageToken);
                        } else {
                            setTimeout(function () {
                                get(index + 1);
                            }, apiNextPageMs);
                        }
                    }).fail(function (err) {
                        console.error(err);
                        setTimeout(function () {
                            get(index + 1);
                        }, apiNextPageMs);
                    });
                }

                paginate("");
            }

            get(0);
        });
    }

    function handlePlaylistIds(playlistIds, videoIds) {
        return new Promise(function (resolve) {
            if (playlistIds.length === 0) {
                console.log("no playlistIds")
                resolve();
                return;
            }

            function get(index) {
                if (index >= playlistIds.length) {
                    console.log("finished playlistIds");
                    setTimeout(resolve, apiNextPageMs);
                    return;
                }

                function paginate(pageToken) {
                    console.log("handlePlaylistIds.get(%s)", index)

                    youtube.ajax("playlistItems", {
                        part: "snippet",
                        maxResults: 50,
                        playlistId: playlistIds[index],
                        pageToken: pageToken
                    }).done(function (res) {
                        console.log(res);

                        (res.items || []).forEach(function (video) {
                            const videoId = video?.snippet?.resourceId?.videoId;
                            const videoOwnerChannelId = video?.snippet?.videoOwnerChannelId;

                            if (videoIds.indexOf(videoId) === -1 && videoOwnerChannelId) {
                                videoIds.push(videoId);
                            }
                        });

                        controls.progress.update({
                            text: videoIds.length
                        })

                        if (res.hasOwnProperty("nextPageToken")) {
                            setTimeout(function () {
                                paginate(res.nextPageToken);
                            }, apiNextPageMs);
                        } else {
                            setTimeout(function () {
                                get(index + 1);
                            }, apiNextPageMs);
                        }
                    }).fail(function (err) {
                        console.error(err);
                        setTimeout(function () {
                            get(index + 1);
                        }, apiNextPageMs);
                    });
                }

                paginate("");
            }

            get(0);
        });
    }

    $(window).init(internal.init);

    return {
        openInMap: openInMap,

        clearResults: clearResults,

        closeAnnouncement: function () {
            const announcement = $(".announcement");
            const id = announcement.attr('id');

            localStorage.setItem(id, 'closed')

            this.checkAnnouncement();
        },

        checkAnnouncement: function () {
            const announcement = $(".announcement");
            const id = announcement.attr('id');

            if (localStorage.getItem(id) === 'closed') {
                announcement.hide();
            }
        },

        resetAnnouncement: function () {
            const announcement = $(".announcement");
            const id = announcement.attr('id');

            localStorage.removeItem(id);

            if (announcement.length) {
                announcement.show();
            }
        }
    }
}());
