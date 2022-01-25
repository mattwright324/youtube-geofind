/*
 * YouTube API v3
 * Reference documentation:
 * https://developers.google.com/youtube/v3/docs/
 *
 * youtube.ajax("youtube", data)
 *
 * @requires jquery.js
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
    module.getDefaultKey = function () {
        return defaultKey;
    };
    module.setKey = function (key) {
        if (defaultKey === "") {
            this.setDefaultKey(key);
        }
        currentKey = key;
    };
    module.getKey = function () {
        return currentKey;
    };
    module.ajax = function (type, data) {
        if (!defaultKey && defaultKey === "" && !currentKey && currentKey === "") {
            console.error("YouTube API Key Missing");
        } else {
            return $.ajax({
                cache: !1,
                data: $.extend({key: currentKey}, data),
                dataType: "json",
                type: "GET",
                timeout: 5e3,
                url: "https://www.googleapis.com/youtube/v3/" + type
            });
        }
    };
    return module;
}());
youtube.setDefaultKey(atob("QUl6YVN5Q0dXYW5PRU1FZ2RIcXN4TkRhYV9aWFRaNmhvWVFybkFJ"));
