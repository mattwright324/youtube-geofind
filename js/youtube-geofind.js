var map = null;
var map_init = false;
var markers = [];
var channelIds = [];

// Google Map
function initMap() {
	let centerPos = {lat: 40.697, lng: -74.259};
	map = new google.maps.Map(document.getElementById('map'), {
		zoom: 7,
		center: centerPos
	});
	map_init = true;
}

// Moves and zooms map to fit all markers.
function refitMapToMarkers() {
	let bounds = new google.maps.LatLngBounds();
	for(let i=0; i<markers.length; i++) {
		bounds.extend(markers[i].getPosition());
	}
	map.fitBounds(bounds);
}

function slowLoadProfile(marker, channelId) {
	youtube.ajax("channels", {
		part: "snippet",
		id: channelId
	}).done(function(res) {
		let channel = res.items[0];
		let icon = {
			url: channel.snippet.thumbnails.default.url,
			scaledSize: new google.maps.Size(20, 20),
			origin: new google.maps.Point(0,0),
			anchor: new google.maps.Point(0,0)
		}
		marker.setIcon(icon);
	});
}

// 
function resize() {
	let width = $(window).width();
	if(width <= 640) {
		$("#channel-content").addClass("flex-column");
	} else {
		$("#channel-content").removeClass("flex-column");
	}
}
resize();
$(window).on('resize', function() {
	resize();
});

// Takes (comma-separated list of) channel name(s) and/or id(s) from text field.
function submitChannelList() {
	let input = document.getElementById('channelInput').value;
	let list = input.split(",");
	for(let i=0; i<list.length; i++) {
		checkChannel(list[i].trim());
	}
}

function removeExample() {
	let example = document.getElementById("channel-example");
	if(example != null) example.remove();
}

// Takes single channel name or channel id.
// Gets uploads playlist and starts checking videos.
function checkChannel(input) {
	let payload = null
	if(input.length <= 20) { // Unsure of actual limits but max of 20 chars found online.
		console.log('Attempting forUsername');
		payload = {forUsername: input};
	} else if(input.length == 24) {
		console.log('Attempting by channel id');
		payload = {id: input};
	}
	if(payload != null){
		// Get channel data.
		youtube.ajax("channels", 
			$.extend({part: "snippet,contentDetails"}, payload)
		).done(function(res) {
			let channel = res.items[0];
			let channelId = channel.id;
			let channelUrl = "https://www.youtube.com/channel/"+channelId;
			let thumbUrl = channel.snippet.thumbnails.default.url;
			let channelName = channel.snippet.title;
			let uploadPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
			if($.inArray(channelId, channelIds) == -1) {
				channelIds.push(channelId);
				let html = '<div id="' + channelId + '" class="d-flex flex-row align-content-center channel " tagcount="0">' +
										'<a target="_blank" href="' + channelUrl + '"><img src="' + thumbUrl + '" width=64px height=64px id="channel-thumb" /></a>' +
										'<div id="channel-content" class="d-flex justify-content-between" style="width: 100%">' +
											'<div id="cc1" class="d-flex flex-column">' +
												'<label id="channel-name">' + channelName + '</label>' +
												'<label id="tag-count">0 videos geo-tagged</label>' +
											'</div>' +
											'<div id="cc2" class="d-flex flex-column" style="width: 25%">' +
												'<div class="progress">' +
													'<div id="videoProg" class="progress-bar progress-bar-striped" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>' +
												'</div>' +
												'<button type="button" class="btn btn-link" id="btnSave" onclick="saveAsCSV(\''+channelId+'\')" disabled>Export CSV <i class="fa fa-download" aria-hidden="true"></i></button>' +
											'</div>' +
										'</div>' +
									'</div>';
				removeExample();
				$("#channel-list").append(html);
			}
			$("#"+channelId).find("#videoProg").css("width", "100%").attr("aria-valuenow", "100").addClass("progress-bar-animated");
			checkPlaylistItems(uploadPlaylistId, '', thumbUrl, channelId, 0, 0, 0, 0);
		}).fail(function(err) {
			dangerError(channelId, err);
		});
	}
}

function channelSort() {
	var $wrapper = $('#channel-list');
	$wrapper.find('.channel').sort(function(a, b) {
		return +a.getAttribute('tagcount') - +b.getAttribute('tagcount');
	}).appendTo($wrapper);
}

// Recursively checks playlistitems and its videos in groups of 50. 
// Geotagged are placed in map & channel display updated.
function checkPlaylistItems(playlistId, pageToken, thumbUrl, channelId, found, progTotal, progCurrent, fails) {
	youtube.ajax("playlistItems", {
		part: "snippet", 
		maxResults: 50, 
		playlistId: playlistId, 
		pageToken: pageToken
	}).done(function(res_pi) {
		if(pageToken == '') {
			progTotal = res_pi.pageInfo.totalResults;
		}
		let ids = [];
		for(let i=0; i<res_pi.items.length; i++) {
			ids.push(res_pi.items[i].snippet.resourceId.videoId);
		}
		progCurrent += res_pi.items.length;
		youtube.ajax("videos", {
			id: ids.join(","), 
			maxResults: 50, 
			part: "snippet,recordingDetails"
		}).done(function(res) {
			let f = 0;
			for(let i=0; i<res.items.length; i++) {
				let item = res.items[i];
				if(item.hasOwnProperty('recordingDetails')) {
					if(item.recordingDetails.hasOwnProperty('location')) {
						let location = item.recordingDetails.location;
						if(location.hasOwnProperty('latitude') && location.hasOwnProperty('longitude')) {
							let displayed = false;
							for(let i=0; i<markers.length; i++) {
								if(markers[i].videoId == item.id) {
									displayed = true;
								}
							}
							if(!displayed) {
								let displayTitle = item.snippet.title.substring(0,65);
								if(item.snippet.title.length > 65) displayTitle += "...";
								let latitude = location.latitude;
								let longitude = location.longitude;
								let infowindow = new google.maps.InfoWindow({
									content: '<div id="geotag">' +
														'<table class="table table-sm">'+
															'<tr><td colspan="2"><a target="_blank" href="https://youtu.be/'+item.id+'">'+displayTitle+'</a></td></tr>'+
															'<tr><td>Author</td><td>'+item.snippet.channelTitle+'</tr>'+
															'<tr><td>Published</td><td>'+item.snippet.publishedAt+'</tr>'+
															'<tr><td>Lat,Long</td><td>'+latitude+','+longitude+'</tr>'+
														'</table>'+
													'</div>'
								});
								let icon = {
									url: thumbUrl,
									scaledSize: new google.maps.Size(20, 20),
									origin: new google.maps.Point(0,0),
									anchor: new google.maps.Point(0,0)
								}
								let marker = new google.maps.Marker({
									position:{lat: latitude, lng: longitude},
									map: map,
									icon: icon,
									channelId: channelId,
									videoId: item.id,
									publishedAt: item.snippet.publishedAt,
									channelTitle: item.snippet.channelTitle,
									title: item.snippet.title
								});
								marker.addListener('click', function() {
									infowindow.open(map, marker);
								});
								markers.push(marker);
								refitMapToMarkers();
							}
							f = f + 1;
						}
					}
				}
			}
			let newFound = found + f;
			if(f > 0) {
				channelSort();
			}
			$("#"+channelId).find("#tag-count").text(newFound+" videos geo-tagged");
			$("#"+channelId).attr("tagcount", newFound);
			if(newFound > 0) {
				$("#btnSaveAll").attr("disabled", false);
				$("#"+channelId).find("#btnSave").attr("disabled", false);
			}
			$("#"+channelId).find("#videoProg").text(progCurrent+" / "+progTotal);
			$("#"+channelId).find("#videoProg").removeClass("bg-warning");
			$("#"+channelId).find("#videoProg").removeClass("bg-danger");
			if(res_pi.hasOwnProperty('nextPageToken')) {
				checkPlaylistItems(playlistId, res_pi.nextPageToken, thumbUrl, channelId, newFound, progTotal, progCurrent, fails);
			} else {
				if(newFound) {
					$("#"+channelId).find("#videoProg").addClass("bg-success");
				} else {
					$("#"+channelId).find("#videoProg").css("background-color", "gray");
				}
				$("#"+channelId).find("#videoProg").css("width", "100%").attr("aria-valuenow", "100").removeClass("progress-bar-animated");
				$('#btnFind').attr("disabled",false);
				channelSort();
			}
		}).fail(function(err) {
			fails = fails+1;
			if(fails <= 5) {
				console.error("Failed to grab videos ["+playlistId+"] retry: #"+fails);
				$("#"+channelId).find("#videoProg").addClass("bg-warning");
				checkPlaylistItems(playlistId, pageToken, thumbUrl, channelId, newFound, progTotal, progCurrent, fails);
			} else {
				dangerError(channelId, err);
			}
		});
	}).fail(function(err) {
		dangerError(channelId, err);
	});
}

// Logs error and changes progressbar.
function dangerError(channelId, err) {
	console.error(err);
	$("#"+channelId).find("#videoProg").removeClass("bg-warning").addClass("bg-danger").removeClass("progress-bar-animated");
}

// Checks marker list for data to download.
function saveAsCSV(channelId) {
	let filename = "geotags_all";
	if(channelId != '0') { filename = channelId; }
	let content = "data:text/csv;charset=utf-8,channel_id,video_id,latitude,longitude,published,channel_title,video_title\n";
	let lineArray = [];
	for(let i=0; i<markers.length; i++) {
		let m = markers[i];
		if(channelId == '0' || markers[i].channelId == channelId) {
			lineArray.push([m.channelId, m.videoId, m.getPosition().lat(), m.getPosition().lng(),m.publishedAt,m.channelTitle,m.title]);
		}
	}
	content += lineArray.join("\n");
	let encodedURI = encodeURI(content);
	let a = document.createElement("a");
	a.setAttribute("href", encodedURI);
	a.setAttribute("download", filename+".csv");
	document.body.appendChild(a);
	a.click();
}

// Waits for object to load in JS
function whenAvailable(objName, callback) {
	let interval = 10;
	window.setTimeout(function() {
		if(window[objName]) {
			callback();
		} else {
			window.setTimeout(arguments.callee, interval);
		}
	}, interval);
}