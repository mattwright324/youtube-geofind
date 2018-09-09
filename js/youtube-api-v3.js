/*
 * YouTube API v3
 * Reference documentation:
 * https://developers.google.com/youtube/v3/docs/
 *
 * youtube.ajax("youtube", data)
 *
 * @author mattwright324
 */
let youtube = (function () {
    let module = {};
    let defaultKey = "";
    let currentKey = "";
    module.setDefaultKey = function (key) {
        defaultKey = key;
        this.setKey(key);
    };
    module.ajax = function (type, data) {
        if (defaultKey === "" || currentKey === "") {
            console.error("YouTube API Key Missing");
        } else {
            return $.ajax({
                cache: !1,
                data: $.extend({key: GOOGLE_API_KEY}, data),
                dataType: "json",
                type: "GET",
                timeout: 5e3,
                url: "https://www.googleapis.com/youtube/v3/" + type
            });
        }
    };
    module.setKey = function (key) {
        if (defaultKey === "") {
            this.setDefaultKey(key);
        }
        currentKey = key;
    };
    return module;
}());
youtube.setDefaultKey("AIzaSyCGWanOEMEgdHqsxNDaa_ZXTZ6hoYQrnAI");