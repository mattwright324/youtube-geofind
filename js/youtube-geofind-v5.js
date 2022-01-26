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
        const thumbs = idx(["snippet", "thumbnails"], video) || {};
        const thumbUrl = (thumbs.medium || thumbs.default || {url: "https://placehold.it/320x180"}).url;
        const videoId = idx(["id"], video) || '';
        const videoTitle = idx(["snippet", "title"], video) || '';
        const videoDescription = idx(["snippet", "description"], video) || '';
        const publishDate = idx(["snippet", "publishedAt"], video);
        const publishedFromNow = publishDate ? publishDate + " (" + moment(publishDate).utc().fromNow() + ")" : '';
        const channelId = idx(["snippet", "channelId"], video) || '';
        const channelTitle = idx(["snippet", "channelTitle"], video) || '';
        const latitude = idx(["recordingDetails", "location", "latitude"], video);
        const longitude = idx(["recordingDetails", "location", "longitude"], video);
        const locationDescription = idx(["recordingDetails", "locationDescription"], video);
        const location = latitude ? latitude + ", " + longitude + (locationDescription ? "  ≡  " + locationDescription + "" : "") : "";

        const duration = moment.duration(idx(["contentDetails", "duration"], video));
        const length = duration.asMilliseconds();
        const hours = moment.duration(length).asHours()|0 || 0;

        const videoLength = length === 0 ? 'live' :
            (hours > 0 ? hours + ":" : "") + moment.utc(length).format((hours > 0 ? "mm" : "m") + ":ss");

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
        const dimension = idx(["contentDetails", "dimension"], video);
        if (dimension === "3d") {
            properties.push("3d");
        }
        const propertiesHtml = properties.length ?
            "<span class='tag'>" +
            properties.join("</span><span class='comma'>, </span><span class='tag'>") +
            "</span>"
            : "";

        const authorThumbs = idx([channelId, "snippet", "thumbnails"], rawChannelMap) || {};
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

    String.prototype.trunc = function (length) {
        return this.length > length ? this.substring(0, length) + "..." : this;
    };

    const hour = 60 * 60 * 1000;
    const day = hour * 24;
    const randomChannel = CHANNELS[rando(0, CHANNELS.length-1)];
    const randomTopic = TOPICS[rando(0, TOPICS.length-1)];
    const randomCoords = CITIES[rando(0, CITIES.length-1)];
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

    let uniqueVideoIds = {};
    let rawVideoData = [];
    let rawChannelMap = {};
    let rawPlaylistMap = {};
    let playlistMap = {};
    let searchParams = {};
    let coordsMap = {}; // coordinate to marker. first video processed at coord gets the marker
    let popupMap = {}; // video id to marker popup
    let shareUrls = [];
    let absoluteShareUrls = [];
    // Omit default values from share link
    const defaultParams = {
        radius: 15,
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

    function sliceLoad(data, table, callback) {
        function slice(index, size) {
            const toAdd = data.slice(index, index + size);
            if (toAdd.length === 0) {
                if (callback) {
                    callback();
                }
                return;
            }

            table.rows.add(toAdd).draw(false);
            table.columns.adjust().draw(false);

            setTimeout(function () {
                slice(index + size, size)
            }, 200);
        }

        slice(0, 1000);
    }

    function buildSearchShareLink(absolute) {
        if (Object.keys(searchParams).length === 0) {
            // Must have done a search to populate share link
            return "";
        }

        const copyParams = $.extend({}, searchParams);
        if (copyParams.hasOwnProperty("timeframe")) {
            if (!absolute) {
                // relative time should not show calculated timestamps
                delete copyParams["start"];
                delete copyParams["end"];
            } else if (absolute && copyParams.timeframe !== 'any' && copyParams.timeframe !== 'custom') {
                copyParams["timeframeWas"] = copyParams.timeframe;
                copyParams.timeframe = "custom";
            }
        }

        const params = [];
        for (let key in copyParams) {
            if (defaultParams.hasOwnProperty(key) && defaultParams[key] === copyParams[key]) {
                console.log('skip ' + key + '==' + defaultParams[key])
                continue;
            }
            params.push(key + "=" + encodeURIComponent(copyParams[key]));
        }
        params.push("doSearch=true");

        return location.origin + location.pathname + "?" + params.join("&").replace("%2C", ",");
    }

    function getSafeRadiusValue() {
        let radius = Number(controls.inputRadius.val());
        if (!Number.isInteger(radius) || radius < 1) {
            radius = 1;
        }
        if (radius > 1000) {
            radius = 1000;
        }
        return radius;
    }

    function buildSearchInputParams() {
        const params = {};
        if (controls.inputAddress.length) {
            const markerPosition = controls.mapLocationMarker.getPosition();

            params["location"] = markerPosition.lat() + "," + markerPosition.lng();
            params["radius"] = getSafeRadiusValue();
        }
        params["keywords"] = controls.inputKeywords.val();
        params["timeframe"] = controls.comboTimeframe.find(":selected").val();
        if (params.timeframe !== "any") {
            let dateFrom = new Date();
            let dateTo = new Date();

            if (params.timeframe === "custom") {
                dateFrom = new Date(controls.inputDateFrom.val());
                dateTo = new Date(controls.inputDateTo.val());
            } else {
                dateFrom.setTime(dateTo.getTime() - defaults.time[params.timeframe]);
            }

            params["start"] = dateFrom.toISOString();
            params["end"] = dateTo.toISOString();
        }
        const lang = controls.comboRelevanceLanguage.find(":selected").val();
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
        return params;
    }

    function handleSearch(searchParams) {
        console.log(searchParams);

        const queryParams = {
            part: 'id',
            maxResults: 50,
            type: 'video'
        };
        const maxPages = searchParams.pages;
        if (searchParams.hasOwnProperty("keywords")) {
            queryParams["q"] = searchParams.keywords;
        }
        if (searchParams.hasOwnProperty("relevanceLanguage")) {
            queryParams["relevanceLanguage"] = searchParams.relevanceLanguage;
        }
        if (searchParams.hasOwnProperty("safeSearch")) {
            queryParams["safeSearch"] = searchParams.safeSearch;
        }
        if (searchParams.hasOwnProperty("sort")) {
            queryParams["order"] = searchParams.sort;
        }
        if (searchParams.hasOwnProperty("duration")) {
            queryParams["videoDuration"] = searchParams.duration;
        }
        if (searchParams.hasOwnProperty("location")) {
            queryParams["location"] = searchParams.location;
        }
        if (searchParams.hasOwnProperty("radius")) {
            queryParams["locationRadius"] = searchParams.radius * 1000 + "m";
        }
        if (searchParams.hasOwnProperty("creativeCommons")) {
            queryParams["videoLicense"] = "creativecommon";
        }
        if (searchParams.hasOwnProperty("live")) {
            queryParams["eventType"] = "live";
        }
        if (searchParams.hasOwnProperty("hq")) {
            queryParams["videoDefinition"] = "high";
        }
        if (searchParams.hasOwnProperty("3d")) {
            queryParams["videoDimension"] = "3d";
        }
        if (searchParams.hasOwnProperty("start")) {
            queryParams["publishedAfter"] = searchParams.start;
        }
        if (searchParams.hasOwnProperty("end")) {
            queryParams["publishedBefore"] = searchParams.end;
        }

        console.log(queryParams)

        controls.progress.update({
            value: 1,
            max: 1,
            text: '0',
            subtext: 'Searching'
        });

        return new Promise(function (resolve) {
            const results = [];

            function doSearch(page, token) {
                console.log("page " + page);

                youtube.ajax("search", $.extend({pageToken: token}, queryParams)).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (item) {
                        const videoId = shared.idx(["id", "videoId"], item);
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
                        doSearch(page + 1, res.nextPageToken);
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
                    resolve();
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

                    get(index + slice, slice);
                }).fail(function (err) {
                    console.error(err);
                    get(index + slice, slice);
                });
            }

            get(0, 50);
        });
    }

    function handleNewChannelIds() {
        let processed = 0;

        const newChannelIds = [];
        rawVideoData.forEach(function (video) {
            const channelId = idx(["snippet", "channelId"], video);

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
                    resolve();
                    return;
                }

                console.log("handleChannelIds.get(" + index + ", " + slice + ")")

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

                    get(index + slice, slice);
                }).fail(function (err) {
                    console.error(err);
                    get(index + slice, slice);
                });
            }

            get(0, 50);
        });
    }

    function doneProgressMessage() {
        return [
            rawVideoData.length + " geotagged video(s)",
            Object.keys(rawChannelMap).length + " channel(s)"
        ].join(", ");
    }

    function processSearch(searchParams) {
        handleSearch(searchParams).then(function (videoIds) {
            return handleVideoIds(videoIds)
        }).then(function () {
            return handleNewChannelIds()
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

            elements.loadingDiv.fadeOut();
        }).catch(function (err) {
            console.error(err);

            internal.displayError("alert-warning", err);

            elements.loadingDiv.fadeOut();
        });
    }

    function processFromParsed(parsed) {
        console.log(parsed);

        const channelUsers = [];
        const channelCustoms = [];
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
            } else if (p.type === "channel_custom" && channelCustoms.indexOf(p.value) === -1) {
                channelCustoms.push(p.value);
            } else if (p.type === "channel_user" && channelUsers.indexOf(p.value) === -1) {
                channelUsers.push(p.value);
            }
        });

        controls.progress.update({
            subtext: 'Grabbing unique video ids'
        });

        Promise.all([
            handleChannelCustoms(channelCustoms, channelIds)
        ]).then(function () {
            return Promise.all([
                // Channels condense to uploads playlist ids and channel ids
                handleChannelUsers(channelUsers, playlistIds, channelIdsCreatedPlaylists),
                handleChannelIds(channelIds, playlistIds, channelIdsCreatedPlaylists)
            ]);
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
                const channelId = shared.idx(["snippet", "channelId"], video);
                if (!rawChannelMap.hasOwnProperty(channelId) && newChannelIds.indexOf(channelId) === -1) {
                    newChannelIds.push(channelId);
                }
            });

            return handleNewChannelIds(newChannelIds, [], []);
        }).then(function () {
            console.log(videoIds);

            controls.progress.update({
                value: 1,
                max: 1,
                text: doneProgressMessage(),
                subtext: 'Done'
            });
        }).catch(function (err) {
            console.error(err);
            internal.displayError("alert-warning", err);

            elements.loadingDiv.fadeOut();
        });
    }

    function handleChannelUsers(channelUsers, playlistIds, channelIdsCreatedPlaylists) {
        return new Promise(function (resolve) {
            if (channelUsers.length === 0) {
                console.log("no channelUsers")
                resolve();
                return;
            }

            function get(index) {
                if (index >= channelUsers.length) {
                    console.log("finished channelUsers");
                    resolve();
                    return;
                }

                console.log("handleChannelUsers.get(" + index + ")")
                console.log(channelUsers[index])

                youtube.ajax("channels", {
                    part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails",
                    forUsername: channelUsers[index]
                }).done(function (res) {
                    console.log(res);

                    const channel = shared.idx(["items", 0], res);
                    if (!channel) {
                        get(index + 1);
                        return;
                    }

                    const channelId = shared.idx(["id"], channel);
                    rawChannelMap[channelId] = channel;

                    if (channelIdsCreatedPlaylists.indexOf(channelId) === -1) {
                        channelIdsCreatedPlaylists.push(channelId);
                    }

                    const uploadsPlaylistId = shared.idx(["items", 0, "contentDetails", "relatedPlaylists", "uploads"], res);
                    console.log(uploadsPlaylistId);

                    if (playlistIds.indexOf(uploadsPlaylistId) === -1) {
                        playlistIds.push(uploadsPlaylistId);
                    }

                    get(index + 1);
                }).fail(function (err) {
                    console.error(err);
                    get(index + 1);
                });
            }

            get(0);
        });
    }

    function handleChannelCustoms(channelCustoms, channelIds) {
        return new Promise(function (resolve) {
            if (channelCustoms.length === 0) {
                console.log("no channelCustoms")
                resolve();
                return;
            }

            function get(index) {
                if (index >= channelCustoms.length) {
                    console.log("finished channelCustoms");
                    resolve();
                    return;
                }

                console.log("handleChannelCustoms.get(" + index + ")")

                youtube.ajax("search", {
                    part: "snippet",
                    maxResults: 50,
                    q: channelCustoms[index],
                    type: 'channel',
                    order: 'relevance'
                }).done(function (res) {
                    console.log(res);

                    const ids = [];
                    (res.items || []).forEach(function (channel) {
                        ids.push(shared.idx(["id", "channelId"], channel));
                    });

                    youtube.ajax("channels", {
                        part: "snippet",
                        id: ids.join(","),
                        maxResults: 50
                    }).done(function (res2) {
                        console.log(res2);

                        (res2.items || []).forEach(function (channel) {
                            const channelId = shared.idx(["id"], channel);
                            const customUrl = shared.idx(["snippet", "customUrl"], channel);

                            if (String(customUrl).toLowerCase() === String(channelCustoms[index]).toLowerCase()) {
                                channelIds.push(channelId);
                            }
                        });

                        get(index + 1);
                    }).fail(function (err) {
                        console.error(err);
                        get(index + 1);
                    });
                }).fail(function (err) {
                    console.error(err);
                    get(index + 1);
                });
            }

            get(0);
        });
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
                    resolve();
                    return;
                }

                console.log("handleChannelIds.get(" + index + ", " + slice + ")")

                const ids = channelIds.slice(index, index + slice);

                youtube.ajax("channels", {
                    part: "snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails",
                    id: ids.join(","),
                    maxResults: 50
                }).done(function (res) {
                    console.log(res);

                    (res.items || []).forEach(function (channel) {
                        const channelId = shared.idx(["id"], channel);
                        rawChannelMap[channelId] = channel;

                        const uploadsPlaylistId = shared.idx(["contentDetails", "relatedPlaylists", "uploads"], channel);
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

                    get(index + slice, slice);
                }).fail(function (err) {
                    console.error(err);
                    get(index + slice, slice);
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
                    resolve();
                    return;
                }

                console.log("handlePlaylistNames.get(" + index + ")")

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
                            const playlistId = shared.idx(["id"], playlist);
                            console.log(playlistId);

                            rawPlaylistMap[playlistId] = playlist;
                            playlistMap[playlistId] = shared.idx(["snippet", "title"], playlist);
                        });

                        if (res.hasOwnProperty("nextPageToken")) {
                            paginate(res.nextPageToken);
                        } else {
                            get(index + 1);
                        }
                    }).fail(function (err) {
                        console.error(err);
                        get(index + 1);
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
                    resolve();
                    return;
                }

                function paginate(pageToken) {
                    console.log("handlePlaylistIds.get(" + index + ")")

                    youtube.ajax("playlistItems", {
                        part: "snippet",
                        maxResults: 50,
                        playlistId: playlistIds[index],
                        pageToken: pageToken
                    }).done(function (res) {
                        console.log(res);

                        (res.items || []).forEach(function (video) {
                            const videoId = shared.idx(["snippet", "resourceId", "videoId"], video);
                            const videoOwnerChannelId = shared.idx(["snippet", "videoOwnerChannelId"], video);

                            if (videoIds.indexOf(videoId) === -1 && videoOwnerChannelId) {
                                videoIds.push(videoId);
                            }
                        });

                        controls.progress.update({
                            text: videoIds.length
                        })

                        if (res.hasOwnProperty("nextPageToken")) {
                            paginate(res.nextPageToken);
                        } else {
                            get(index + 1);
                        }
                    }).fail(function (err) {
                        console.error(err);
                        get(index + 1);
                    });
                }

                paginate("");
            }

            get(0);
        });
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
                lengthMenu: [[10, 25, 50, 100, 250, -1], [10, 25, 50, 100, 250, "All"]],
                ordering: false,
                deferRender: true,
                bDeferRender: true,
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

                            new Promise(function (resolve) {
                                internal.submit();

                                resolve();
                            })
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
                        showWhen: function () {
                            return internal.markersList.length;
                        },
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
            controls.comboRelevanceLanguage = $("#relevanceLanguage");
            controls.comboSafeSearch = $("#safeSearch");
            controls.comboDuration = $("#videoDuration");
            controls.comboTimeframe = $("#timeframe");
            elements.customRangeDiv = $(".customRange");
            controls.inputDateFrom = $("#dateFrom");
            controls.inputDateTo = $("#dateTo");
            controls.comboPageLimit = $("#pageLimit");

            controls.btnExport = $("#export");
            controls.btnImport = $("#import");
            controls.importFileChooser = $("#importFileChooser");
            controls.shareLink = $("#shareLink");
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
            }

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

                $("#btnSubmit .countdown").text(count);

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

            module.clearResults();

            const parsed = [];
            controls.inputChannels.val().split(",").forEach(function (part) {
                parsed.push(shared.determineInput(part.trim()));
            });
            processFromParsed(parsed);
        },

        updateShareLink: function () {
            const absolute = controls.checkAbsoluteTimeframe.is(":checked");

            controls.shareLink.val(buildSearchShareLink(absolute));
            controls.shareLink.attr("disabled", false);
        },

        submit: function () {
            $("#btnSubmit").addClass("loading").addClass("disabled")
            function countdown(count) {
                console.log(count);

                $("#btnSubmit .countdown").text(count);

                setTimeout(function () {
                    if (count === 1) {
                        $("#btnSubmit").removeClass("loading").removeClass("disabled")
                    } else {
                        countdown(count - 1);
                    }
                }, 1000);
            }
            countdown(3)

            elements.loadingDiv.show();

            searchParams = buildSearchInputParams();
            internal.updateShareLink();

            if (controls.checkClearResults.is(":checked")) {
                module.clearResults();
            }

            const share = buildSearchShareLink(false);
            shareUrls.push(share);
            const shareAbsolute = buildSearchShareLink(true);
            if (share !== shareAbsolute) {
                absoluteShareUrls.push(shareAbsolute);
            }

            processSearch(searchParams);
        },


        setupPageControls: function () {
            const KEY_ENTER = 13;

            controls.checkAbsoluteTimeframe.change(function () {
                if (controls.shareLink.val().length) {
                    internal.updateShareLink();
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
                zip.file("geotags.csv", module.formatVideosToCSV());

                const fileName = shared.safeFileName("geofind_" + internal.pageType + ".zip");

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
                    controls.inputValue.val(file.name);
                } else {
                    return;
                }

                importFile(file);
            });

            function importFile(file) {
                console.log("Importing from file " + file.name);

                controls.btnImport.addClass("loading").addClass("disabled");
                module.clearResults();

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

                    controls.btnImport.removeClass("loading").removeClass("disabled");
                });
            }

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
                        const radiusInMeters = getSafeRadiusValue() * 1000;

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

        getLanguage: function (video) {
            const snippet = video.snippet || {};
            return snippet.defaultLanguage || snippet.defaultAudioLanguage;
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

        pushVideo: function (video) {
            if (!internal.doesVideoHaveLocation(video)) {
                return;
            }

            const videoId = video.id;
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
            const markerPopup = new google.maps.InfoWindow({
                content: format.videoToMarkerInfoWindowHtml(video),

                latLng: latLng,

                about: {
                    channelId: channelId,
                    channelTitle: video.snippet.channelTitle,
                    thumbLoaded: false,

                    videoId: videoId,
                    videoTitle: video.snippet.title,
                    videoDesc: video.snippet.description,
                    published: video.snippet.publishedAt,
                    locationDescription: video.recordingDetails.locationDescription,
                    language: String(internal.getLanguage(video)),
                    position: position
                }
            });
            popupMap[videoId] = markerPopup;

            google.maps.event.addListener(markerPopup, "domready", function () {
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
                    popupMap[videoId].close();
                    module.openInMap(selectedVideo, true);
                });
            });

            if (!coordsMap.hasOwnProperty(latLng)) {
                const authorThumbs = idx([channelId, "snippet", "thumbnails"], rawChannelMap) || {};
                const authorThumbUrl = (authorThumbs.default || authorThumbs.medium ||
                    {url: "https://placehold.it/18x18"}).url;
                const icon = {
                    url: authorThumbUrl,
                    scaledSize: new google.maps.Size(defaults.mapMarkerWidth, defaults.mapMarkerWidth),
                    origin: new google.maps.Point(0, 0),
                    anchor: new google.maps.Point(0, 0)
                };
                const marker = new google.maps.Marker({
                    position: position,
                    map: internal.map,
                    icon: icon,
                    openPopup: () => {
                        markerPopup.open(internal.map, marker);
                    },
                    closePopup: () => {
                        markerPopup.close();
                    }
                });
                coordsMap[latLng] = {
                    marker: marker,
                    videoIds: [videoId]
                };

                marker.addListener("click", () => {
                    marker.openPopup();
                });

                internal.markersList.push(marker);
                internal.adjustMapToResults();
            }
            if (coordsMap[latLng].videoIds.indexOf(videoId) === -1) {
                coordsMap[latLng].videoIds.push(videoId);
            }

            // Push to list
            const listItemHtml = format.videoToListItemHtml(video);
            controls.geotagsTable.row.add([0, listItemHtml, String(video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage)]).draw();
            internal.updateLanguageDropdown(video);
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

            for (let i = 0; i < internal.markersList.length; i++) {
                bounds.extend(internal.markersList[i].getPosition());
            }

            internal.map.fitBounds(bounds);
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

                $("#geolocate .countdown").text(count);

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

                $("#randomLocation .countdown").text(count);

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
            if (!popupMap.hasOwnProperty(videoId)) {
                console.log('Video does not have popup [' + videoId + ']')
                return;
            }

            const popup = popupMap[videoId];
            const latLng = popup.latLng;

            const marker = coordsMap[latLng].marker;
            popup.open(internal.map, marker)

            if (focusOnSelect) {
                setTimeout(function () {
                    $(".type-marker." + videoId + " .multi select").focus().click();
                }, 50);
            }
        },

        clearResults: function () {
            uniqueVideoIds = {};
            rawVideoData = [];
            rawChannelMap = {};
            rawPlaylistMap = {};
            playlistMap = {};
            popupMap = {};
            coordsMap = {};
            shareUrls = [];
            absoluteShareUrls = [];

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
        formatVideosToCSV: function (channelId) {
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
        },

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
        paramSafeSearch: {
            param: 'safeSearch',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#safeSearch option[value='" + paramValue + "']").length) {
                    controls.comboSafeSearch.val(paramValue);
                    controls.comboSafeSearch.trigger("change");
                }
            }
        },
        paramRelevanceLanguage: {
            param: 'relevanceLanguage',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#relevanceLanguage option[value='" + paramValue + "']").length) {
                    controls.comboRelevanceLanguage.val(paramValue);
                    controls.comboRelevanceLanguage.trigger("change");
                }
            }
        },
        paramSort: {
            param: 'sort',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                if (paramValue && $("#sortBy option[value='" + paramValue + "']").length) {
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
                if (paramValue && controls.inputDateFrom.length && rfcDate && rfcDate !== 'Invalid date') {
                    controls.inputDateFrom.val(rfcDate);
                }
            }
        },
        paramEnd: {
            param: 'end',
            updatePage: function (parsedQuery) {
                const paramValue = parsedQuery[this.param];

                const rfcDate = moment(paramValue).utcOffset(0, true).format(RFC_3339);
                if (paramValue && controls.inputDateTo.length && rfcDate && rfcDate !== 'Invalid date') {
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
