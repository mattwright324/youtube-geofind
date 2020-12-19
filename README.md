# YouTube Geofind

Search by channel, topic, and location for geotagged videos. View in map and export results.

* https://mattw.io/youtube-geofind/

![Example](https://i.imgur.com/nZErA91.png)

What's unique about this tool? How can you use it?

1. Find cool videos where you live or anywhere in the world!
    - What videos were posted by you in the last week? (find me, past 7 days)
    - What livestreams are running now in my state/country? (find me, radius 500 or 1000, live events only)
2. Use it for investigative purposes, OSINT.
    - Channel searching allows you to check all the uploads on a channel for geotags and displays them in a map.
    - Topic searching allows you to check if any uploads found by regular searching or keywords have geotags (though,
      not many do).
    - Location searching allows you to find videos with geotags within your chosen radius and timeframe.
    - Export results to save your findings and use elsewhere.
    - Results can be directly opened in my new YouTube Metadata tool to give all details about that video and its
      author.
3. Query API as noted below

## Query API

The tool provides a pseudo-api with query parameters that allow manipulation of the page elements so that you can share
a search you made or implement a linked custom search from your own site/tool.

### Channel page

The following parameter(s) will work with just the channel page `/youtube-geofind/`

| Parameter | Accepted values |
| :---: | :--- |
| channels | string, comma separated list of channel names or ids <br> e.g. <br>`UChirEOpgFCupRAk5etXqPaA` <br>`vicenews,UChirEOpgFCupRAk5etXqPaA,thesamlivecast` |

Example(s)

- https://mattw.io/youtube-geofind/?channels=GP4YOU&doSearch=true

### Location & Topic pages

The following parameter(s) are shared by both the location `/youtube-geofind/location` and
topic `/youtube-geofind/topic` pages.

| Parameter | Accepted values |
| :---: | :--- |
| keywords | string, keywords exactly like you could put into YouTube search |
| sort | string, may only be one of the specified values that show in the select box in the page. otherwise the select box will become blank <br> One of these only: `date, relevance, viewCount, rating` |
| timeframe | string, may only be one of the specified values that show in the select box in the page. otherwise the select box will become blank <br> One of these only: `any, hour-1, hour-3, hour-6, hour-12, hour-24, day-7, day-30, day-90, day-365, custom` |
| start | date-string of format yyyy-MM-dd. may only be used with timeframe=custom. must be before end date. <br> e.g. `2018-12-24` |
| end | date-string of format yyyy-MM-dd. may only be used with timeframe=custom. must be after start date. <br> e.g. `2018-12-26` |
| pages | integer, may only be one of the specified values that show in the select box in the page. otherwise the select box will become blank <br> One of these only: `1, 2, 3, 5, 7, 15` |
| live | boolean `true` or `false` |
| creativeCommons | boolean `true` or `false` |
| hd | boolean `true` or `false` |
| embeddable | boolean `true` or `false` |
| syndicated | boolean `true` or `false` |

Example(s)

- https://mattw.io/youtube-geofind/topic?keywords=hurricane&doSearch=true

### Location page

The following parameter(s) will work with just the location page `/youtube-geofind/location`

| Parameter | Accepted values |
| :---: | :--- |
| location | string, comma separated latitude & longitude <br> e.g. `43.054098,-79.2281175` |
| locationAddress | string, exactly like anything you could put into Google Maps <br> e.g. `the white house` |
| radius | integer, may only be one of the specified values that show in the select box in the page. otherwise, the select box will become blank <br> One of these only:  `1, 2, 5, 10, 15, 20, 50, 100, 200, 500, 1000` |

Example(s)

- https://mattw.io/youtube-geofind/location?location=43.054098,-79.2281175&radius=2&doSearch=true
- https://mattw.io/youtube-geofind/location?locationAddress=ohio&radius=1000&live=true&doSearch=true
- https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=day-30&doSearch=true
- https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=day-30&doSearch=true
- https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=custom&start=2018-05-01&end=2018-05-14&doSearch=true

### All pages

This parameter is shared by all page types.

| Parameter | Accepted values |
| :---: | :--- |
| doSearch | boolean <br> `true` to click the page's submit button <br> `false` don't click submit, might as well just omit the parameter |

All of the examples above use this single parameter.
