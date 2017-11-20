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
function initMap() { 
	let centerPos = {lat: 40.697, lng: -74.259};
	map = new google.maps.Map(document.getElementById('map'), {
		zoom: 7,
		center: centerPos
	});
	map_init = true;
	geodata = new GeoData(map);
	disableForm(false);
 }
 // Similar to java.util.Map
 function MyMap() {
	this.keyVal = {};
}
MyMap.prototype = {
	put : function(key, val) { this.keyVal[key] = val; },
	get: function(key) { return this.keyVal[key]; },
	containsKey: function(key) { return this.keyVal[key] !== undefined; },
	size: function() { return this.keyVal.length; },
	clear: function() { this.keyVal = {}; },
	remove: function(key) { delete this.keyVal[key]; },
	isEmpty: function() { $.isEmptyObject(this.keyVal); },
	getOrDefault: function(key, defaultValue) { if(this.containsKey(key)) { return key; } else { return defaultValue; } },
}
// JQuery quick modification of Bootstrap progress bar.
function ProgressBar(document_element) {
	this.el = $(document_element);
	this.el.addClass("progress-bar-striped");
}
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
		this.el.removeClass("bg-success").removeClass("bg-warning").removeClass("bg-danger").removeClass("bg-info").addClass(statusClass);
		return this;
	},
	setText: function(message) {
		this.el.text(message);
		return this;
	}
}
// Geofinder. Modifies map and conducts search.
function GeoData(map) {
	this.geocoder = new google.maps.Geocoder();
	this.channelMap = new MyMap() // [key] = val implementation
	this.markers = [];
	this.showingHeatmap = false;
	this.heatData = [];
	this.heatmap = new google.maps.visualization.HeatmapLayer({ 
		data: this.heatData,
		radius: 20,
		dissipating: true
	});
	this.map = map;
	this.circle = new google.maps.Circle({
		strokeColor: "#00fff0",
		strokeOpacity: 0.5,
		strokeWeight: 2,
		fillColor: "#00fff0",
		fillOpacity: 0.15,
		radius: 10000,
		center: map.center
	});
	this.locationMarker = new google.maps.Marker({
		position: map.center,
		draggable: true,
		icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
		title: "Drag me!",
		optimized: false,
		zIndex:99999999,
		showing: false
	});
	this.progress = new ProgressBar(document.getElementById("videoProg"));
}
GeoData.prototype = {
	getMap: function() { return this.map },
	getMarkers: function() { return this.markers; },
	getHeatData: function() { return this.heatData; },
	getHeatMap: function() { return this.heatmap; },
	showHeatmap: function(show) {
		this.showingHeatmap = show;
		if(show) {
			this.heatmap.setMap(this.map);
		} else {
			this.heatmap.setMap(null);
		}
	},
	reloadHeatData: function() {
		this.heatData = [];
		for(let i=0; i<this.markers.length; i++) {
			this.heatData.push(this.markers[i].getPosition());
		}
		this.heatmap.setData(this.heatData);
	},
	videoHasMarker: function(videoId) {
		for(let i=0; i<this.markers.length; i++) {
			if(this.markers[i].videoId == videoId) {
				return true;
			}
		}
		return false;
	},
	getRequestData: function() {
		// Used for both Topic and Location
		let data = {};
		data["q"] = $("#q").val();
		data["order"] = $("#order-by").find(":selected").val();
		if(this.locationMarker.showing) {
			let pos = this.locationMarker.getPosition();
			data["location"] = pos.lat()+","+pos.lng();
			data["locationRadius"] = this.circle.getRadius()+"m";
		}
		if($("#live-only").is(":checked")) {
			data["eventType"] = "live";
		}
		if($("#creative-commons").is(":checked")) {
			data["videoLicense"] = "creativeCommon";
		}
		if($("#hd-only").is(":checked")) {
			data["videoDefinition"] = "high";
		}
		if($("#embedded-only").is(":checked")) {
			data["videoEmbeddable"] = "true";
		}
		if($("#syndicated-only").is(":checked")) {
			data["videoSyndicated"] = "true";
		}
		let time = $("#time-frame").find(":selected").val();
		if(time != "hour-any") {
			let beforeDate = new Date();
			let afterDate = new Date(beforeDate);
			if(time == "hour-1") {
				afterDate.setTime(beforeDate.getTime() - (1*60*60*1000));
			} else if(time == "hour-3") {
				afterDate.setTime(beforeDate.getTime() - (3*60*60*1000));
			} else if(time == "hour-6") {
				afterDate.setTime(beforeDate.getTime() - (6*60*60*1000));
			} else if(time == "hour-12") {
				afterDate.setTime(beforeDate.getTime() - (12*60*60*1000));
			} else if(time == "hour-24") {
				afterDate.setTime(beforeDate.getTime() - (24*60*60*1000));
			} else if(time == "day-7") {
				afterDate.setTime(beforeDate.getTime() - (7*24*60*60*1000));
			} else if(time == "day-30") {
				afterDate.setTime(beforeDate.getTime() - (30*24*60*60*1000));
			} else if(time == "day-365") {
				afterDate.setTime(beforeDate.getTime() - (365*24*60*60*1000));
			} else if(time == "custom") {
				beforeDate = new Date(document.getElementById("publishedBefore").value);
				afterDate = new Date(document.getElementById("publishedAfter").value);	
			}
			data["publishedBefore"] = beforeDate.toJSON();
			data["publishedAfter"] = afterDate.toJSON();
		}
		console.log(data);
		return data;
	},
	inspectChannelList: function(formId) {
		let value = document.getElementById(formId).value;
		let list = value.split(",");
		for(let i=0; i<list.length; i++) {
			let val = list[i].trim();
			if(val.length == 24) {
				this.inspectChannel({id: val});
			} else if(val.length <= 20) {
				this.inspectChannel({forUsername: val});
			} else {
				console.log("Invalid entry... "+val);
			}
		}
	},
	inspectChannel: function(data) {
		disableForm(true);
		data["part"] = "snippet,contentDetails";
		youtube.ajax("channels", data).done((res) => {
			let channel = res.items[0];
			if(channel != undefined) {
				let channelId = channel.id;
				let channelUrl = "https://www.youtube.com/channel/"+channelId;
				let thumbUrl = channel.snippet.thumbnails.default.url;
				let channelName = channel.snippet.title;
				let uploadPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
				if(!this.channelMap.containsKey(channelId)) {
					this.channelMap.put(channelId, thumbUrl);
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
								'<button type="button" class="btn btn-link" id="btnSave" onclick="geodata.exportToCSV(\''+channelId+'\')" disabled>Export CSV <i class="fa fa-download" aria-hidden="true"></i></button>' +
							'</div>' +
						'</div>' +
					'</div>';
					$("#channel-example *").css("display", "inline-block").hide();
					$("#channel-list").append(html);
				}
				let data = {
					part: "snippet",
					maxResults: 50,
					playlistId: uploadPlaylistId,
					pageToken: ""
				};
				let playlistItems = (data, extra) => {
					youtube.ajax("playlistItems", data).done((res) => {
						if(data["pageToken"] == "") { extra["totalResults"] = res.pageInfo.totalResults; }
						extra.parsedResults += res.items.length;
						extra.progress.setText(extra.parsedResults+" / "+extra.totalResults);
						let ids = [];
						for(let i=0; i<res.items.length; i++) {
							ids.push(res.items[i].snippet.resourceId.videoId);
						}
						this.checkVideos(ids, extra.progress, (res2) => {
							let found = 0;
							for(let i=0; i<res2.items.length; i++) {
								let item = res2.items[i];
								if(item.hasOwnProperty('recordingDetails')) {
									if(item.recordingDetails.hasOwnProperty('location')) {
										let location = item.recordingDetails.location;
										if(location.hasOwnProperty('latitude') && location.hasOwnProperty('longitude')) {
											if(!this.videoHasMarker(item.id)) {
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
												let marker = new google.maps.Marker({
													position:{lat: latitude, lng: longitude},
													map: this.map,
													videoId: item.id,
													publishedAt: item.snippet.publishedAt,
													channelTitle: item.snippet.channelTitle,
													title: item.snippet.title,
													channelId: item.snippet.channelId
												});
												this.asyncLoadProfile(marker, item.snippet.channelId);
												marker.addListener('click', () => {
													infowindow.open(this.map, marker);
												});
												this.markers.push(marker);
												$("#btnSaveAll").attr("disabled", false);
												this.refitMapToMarkers();
												found += 1;
											}
										}
									}
								}
							}
							extra.found += found;
							$("#"+extra.channelId).find("#tag-count").text(extra.found+" videos geo-tagged");
							if(extra.found > 0) {
								$("#"+extra.channelId).find("#btnSave").attr("disabled", false);
							}
							if(res.hasOwnProperty("nextPageToken") && res.items.length > 0) {
								data["pageToken"] = res.nextPageToken;
								extra.page += 1;
								playlistItems(data, extra);
							} else {
								extra.progress.setAnimated(false).setStatus("bg-success");
								disableForm(false);
							}
						});
					}).fail((err) => {
						this.danger(extra.progress, err);
					});
				};
				let channelProg = new ProgressBar($("#"+channelId).find("#videoProg"));
				channelProg.setAnimated(true).setValue(100).setText("0 / ...");
				playlistItems(data, {
					totalResults: 0, 
					parsedResults: 0, 
					progress: channelProg, 
					page: 1, 
					found: 0,
					channelId: channelId
				});
			} else {
				disableForm(false);
				let channel = "undefined";
				if(data["forUsername"] != undefined) { channel = data["forUsername"]; }
				else if(data["id"] != undefined) { channel = data["id"]; }
				this.announce("alert-warning", "Bad channel!", "The channel \""+channel+"\" entered does not exist.", true, "c_"+channel);
			}
		}).fail((err) => {
			console.log(err);
		});
	},
	normalSearch: function() { // Topic and Location Search
		disableForm(true);
		let requestData = this.getRequestData();
		requestData["pageToken"] = "";
		requestData["maxResults"] = 50;
		requestData["type"] = "video";
		requestData["part"] = "id";
		this.progress.setAnimated(true).setValue(100);
		let search = (data, extra) => {
			console.log(data);
			console.log(extra);
			youtube.ajax("search", data).done((res) => {
				this.progress.setText("Page #"+extra.page+" ("+res.items.length+" videos)");
				let videoIds = [];
				for(let i=0; i<res.items.length; i++) {
					let item = res.items[i];
					videoIds.push(item.id.videoId);
				}
				this.checkVideos(videoIds, this.progress, (res2) => {	
					for(let i=0; i<res2.items.length; i++) {
						let item = res2.items[i];
						if(item.hasOwnProperty('recordingDetails')) {
							if(item.recordingDetails.hasOwnProperty('location')) {
								let location = item.recordingDetails.location;
								if(location.hasOwnProperty('latitude') && location.hasOwnProperty('longitude')) {
									if(!this.videoHasMarker(item.id)) {
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
										let marker = new google.maps.Marker({
											position:{lat: latitude, lng: longitude},
											map: this.map,
											videoId: item.id,
											publishedAt: item.snippet.publishedAt,
											channelTitle: item.snippet.channelTitle,
											title: item.snippet.title,
											channelId: item.snippet.channelId
										});
										this.asyncLoadProfile(marker, item.snippet.channelId);
										marker.addListener('click', () => {
											infowindow.open(this.map, marker);
										});
										this.markers.push(marker);
										$("#btnSaveAll").attr("disabled", false);
										this.refitMapToMarkers();
										let thumb = item.snippet.thumbnails.default;
										let dataTable = $("#dataTable").DataTable();
										dataTable.row.add(
										["<tr><td>"+
											"<div class=\"d-flex flex-row justify-content-start\">"+
												"<img width=120px height=90px style=\"margin: auto 0;\" src=\""+thumb.url+"\"/> "+
												"<div class=\"d-flex flex-column\" style=\"margin-left: 15px; margin-top: auto; margin-bottom: auto;\">"+
													"<p style=\"white-space: nowrap;\"><a target=\"_blank\" href=\"https://youtu.be/"+item.id+"\">"+displayTitle+"</a></p>"+
													"<p><b>Author: </b><a target=\"_blank\" href=\"https://www.youtube.com/channel/"+item.snippet.channelId+"\">"+item.snippet.channelTitle+"</a></p>"+
													"<p><b>Published on</b> "+item.snippet.publishedAt+"</p>"+
												"</div>"+
											"</div>"+
										"</td></tr>"]).draw();
									}
								}
							}
						}
					}
					if(this.showingHeatmap) { this.reloadHeatData(); }
					if(res.hasOwnProperty("nextPageToken") && res.items.length > 0 && extra.page < extra.pageLimit) {
						data["pageToken"] = res.nextPageToken;
						extra.page += 1;
						search(data, extra);
					} else {
						this.progress.setAnimated(false).setText("Done").setStatus("bg-success");
						disableForm(false);
					}
				});
			}).fail((err) => {
				this.danger(this.progress, err);
			});
		};
		search(requestData, {page: 1, pageLimit: $("#page-limit").find(":selected").val()});
	},
	checkVideos: function(idList, progressBar, callback) {
		// Max of 50 ids accepted.
		// Used to inspect lists of videos from both channel uploads and normal search.
		youtube.ajax("videos", {
			id: idList.join(","), 
			maxResults: 50, 
			part: "snippet,recordingDetails"
		}).done((res) => {
			callback(res);
		}).fail((err) => {
			this.danger(progressBar, err);
		});
	},
	danger: function(progressBar, err) {
		let response = JSON.parse(err.responseText);
		console.log(response);
		progressBar.setAnimated(false).setStatus("bg-danger");
		this.announce("alert-danger", "Problem!", "Error "+response.error.code+": "+response.error.message);
		disableForm(false);
	},
	announce: function(level, title, message) {
		$("#announcement").append("<div class=\"alert "+level+" alert-dismissible fade show\" role=\"alert\">"+
			"<button type=\"button\" class=\"close\" data-dismiss=\"alert\" aria-label=\"Close\">"+
				"<span aria-hidden=\"true\">&times;</span>"+
			"</button>"+
			"<strong>"+title+"</strong> "+message+
		"</div>");
	},
	asyncLoadProfile: function(marker, channelId) {
		function setMarker(marker, thumbUrl) {
			let icon = {
				url: thumbUrl,
				scaledSize: new google.maps.Size(20, 20),
				origin: new google.maps.Point(0,0),
				anchor: new google.maps.Point(0,0)
			}
			marker.setIcon(icon);
		}
		setTimeout(() => {
			if(this.channelMap.containsKey(channelId)) {
				setMarker(marker, this.channelMap.get(channelId));
			} else {
				youtube.ajax("channels", {
					part: "snippet",
					id: channelId
				}).done((res) => {
					let channel = res.items[0];
					let thumbUrl = channel.snippet.thumbnails.default.url;
					this.channelMap.put(channelId, thumbUrl);
					setMarker(marker, thumbUrl);
				});
			}
		}, 0);
	},
	setLocationMode: function(set) {
		this.locationMarker.setMap(this.map);
	},
	exportToCSV: function(channel_id) {
		let filename = "geotags_all";
		if(channel_id != undefined) { filename = channel_id; }
		let content = "data:text/csv;charset=utf-8,channel_id,video_id,latitude,longitude,published,channel_title,video_title\n";
		let lineArray = [];
		for(let i=0; i<this.markers.length; i++) {
			let m = this.markers[i];
			if(channel_id == undefined || this.markers[i].channelId == channel_id) {
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
	},
	refitMapToMarkers: function() {
		let bounds = new google.maps.LatLngBounds();
		for(let i=0; i<this.markers.length; i++) {
			bounds.extend(this.markers[i].getPosition());
		}
		this.map.fitBounds(bounds);
	},
	refitMapToLocation: function() {
		let bounds = new google.maps.LatLngBounds();
		bounds.extend(this.locationMarker.getPosition());
		bounds.union(this.circle.getBounds());
		this.map.fitBounds(bounds);
	},
	placeLocationMarker: function() {
		this.locationMarker.setMap(this.map);
		this.locationMarker.showing = true;
		this.circle.setMap(this.map);
		this.locationMarker.addListener("dragend", () => {
			this.circle.setCenter(this.locationMarker.getPosition());
			this.refitMapToLocation();
			this.updateLocationAddress(true);
		});
		this.updateLocationAddress(true);
	},
	updateLocationAddress: function(reverseGeocode, address) {
		if(reverseGeocode) {
			// Reverse Geocode {lat, lng} -> {Address}
			let pos = this.locationMarker.getPosition();
			this.geocoder.geocode({"location": pos}, (res, stat) => {
				if(stat === "OK") {
					if(res[0]) {
						$("#address").attr("value", res[0].formatted_address);
					} else {
						$("#address").attr("value", pos.lat()+","+pos.lng());
					}
				}
			});
		} else {
			// Geocode {Address} -> {lat, lng}
			this.geocoder.geocode({address: address}, (res, stat) => {
				if(stat === "OK") {
					if(res[0]) {
						let results = res[0];
						let latlng = results.geometry.location;
						this.locationMarker.setPosition(latlng);
						this.circle.setCenter(this.locationMarker.getPosition());
						this.refitMapToLocation();
					}
				}
			});
		}
	},
	geolocate: function() {
		$("#geolocate").attr("disabled", true);
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition((pos) =>{
				let latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
				this.locationMarker.setPosition(latlng);
				this.circle.setCenter(this.locationMarker.getPosition());
				this.refitMapToLocation();
				this.updateLocationAddress(true);
				$("#geolocate").attr("disabled", false);
			});
		}
	},
}
function disableForm(disable) {
	$("#search-form *").attr("disabled", disable);
}
function setupAsPage(searchType) {
	pageType = searchType;
	whenAvailable("geodata", function() {
		// geodata.showHeatmap(true);
		if(searchType == "channel") {
			disableForm(false);
			$("#channelInput").keyup(function(event) {
				if (event.keyCode === 13) {
					$("#btnFind").click();
				}
			});
		} else if(searchType == "topic" || searchType == "location") {
			disableForm(false);
			$(document).ready(function() {
				$("#dataTable").DataTable();
			});
			$("#time-frame").on("change", function() {
				let value = this.value;
				if(value == "custom") {
					$("#custom-range").show();
				} else {
					$("#custom-range").hide();
				}
			});
			$("#custom-range").hide();
			if(searchType == "location") {
				$("#address").keyup(function(event) {
					if (event.keyCode === 13) {
						geodata.updateLocationAddress(false, $("#address").val());
					}
				});
				document.getElementById("distance").onchange = function() {
					let dist_list = document.getElementById("distance");
					let distance = dist_list.options[dist_list.selectedIndex].value * 1000;
					geodata.circle.setRadius(distance);
				}
				geodata.placeLocationMarker();
				geodata.refitMapToLocation();
			} else {
				$("#q").keyup(function(event) {
					if (event.keyCode === 13) {
						$("#btnFind").click();
					}
				});
			}
		}
	});
}