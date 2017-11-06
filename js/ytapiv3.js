// YouTube API v3
// Reference documentation:
// https://developers.google.com/youtube/v3/docs/
var GOOGLE_API_KEY = 'AIzaSyCGWanOEMEgdHqsxNDaa_ZXTZ6hoYQrnAI';
class YouTubeV3 {
	// string type: "search"
	// json data: {part: "snippet", maxResults: 50, q: "hello world"}
	ajax(type, data) {
		return $.ajax({cache:!1,data:$.extend({key:GOOGLE_API_KEY},data),dataType:"json",type:"GET",timeout:5e3,url:"https://www.googleapis.com/youtube/v3/"+type});
	}
}
var youtube = new YouTubeV3();