# youtube-geofind
Search YouTube channels for geo-tagged videos. View in map and export to CSV.

* https://mattw.io/youtube-geofind/

## Donate

If you'd like to support future development or just thank me, you can send donations @ [paypal.me/mattwright324](https://www.paypal.me/mattwright324)

## Query parameters

Also available are query parameters which allow you to manipulate the Location search page.
Detailed below are the different parameters, their constraints, and what they do.

    // Main query parameters
    location= {latitude,longitude}
        // Location takes a value of latitude and longitude. It will set the map to that location.
    locationAddress= {any location by name, as if searching Google Maps}
        // Any address in any format. 
        // Geocodes to coordinates and sets the map to that location.
        // Value should be URLEncoded.
    radius= {1,2,5,10,15,20,50,100,200,500,1000}
        // Value is in kilometers. Value must be one of these and no others. 
        // Using a value not listed will make the radius select box blank.
    keywords= {keywords as if searching YouTube, URLEncoded}
        // Keywords as if actually searching YouTube. 
        // Value should be URLEncoded.
    sort= {date,relevance,viewCount,rating}
        // Value must be one of these and no others. 
        // Using a value not listed will make the sort select box blank.
    timeframe= {any,hour-1,hour-3,hour-6,hour-12,hour-24,day-7,day-30,day-90,day-365,custom}
        // Value must be one of these and no others. 
        // Using a value not listed will make the timeframe select box blank.
    start= {date yyyy-MM-dd}
        // Start date requires timeframe=custom.
    end= {date yyyy-MM-dd}
        // End date requires timeframe=custom.
    pages= {1,2,3,5,7,15}
        // Value must be one of these and no others. 
        // Using a value not listed will make the page limit select box blank.
    doSearch= {true/false}
        // Setting this to true will trigger the search to fire.
    
    // Setting any of these to true will check their checkboxes and cause the Advanced Options section to expand.
    live= {true/false}
    creativeCommons= {true/false}
    hd= {true/false}
    embeddable= {true/false}
    syndicated= {true/false}
    
Now for some examples using these query parameters:

* https://mattw.io/youtube-geofind/location?location=43.054098,-79.2281175&radius=2&doSearch=true
* https://mattw.io/youtube-geofind/location?locationAddress=ohio&radius=1000&live=true&doSearch=true
* https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=day-30&doSearch=true
* https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=day-30&doSearch=true
* https://mattw.io/youtube-geofind/location?locationAddress=the%20white%20house&radius=15&timeframe=custom&start=2018-05-01&end=2018-05-14&doSearch=true
