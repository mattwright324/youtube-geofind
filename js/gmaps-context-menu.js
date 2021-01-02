/**
 * Meta context-menu object that all GmapsContextMenu's call on menu item click.
 */
const GmapsContext = (function () {
    const settings = {
        registerCloseForEverything: true
    }

    const contexts = {};
    return {
        register: function (ID, object) {
            contexts[ID] = object;
        },

        onMenuRegister: function () {
            /**
             * When multiple context menus are open for multiple mapOrShapes,
             * close them all when clicked outside all context menus.
             */
            if (settings.registerCloseForEverything) {
                console.log('register close for everything')
                for (let id1 in contexts) {
                    const contextA = contexts[id1];
                    for (let id2 in contexts) {
                        if (id1 === id2) {
                            continue;
                        }
                        const contextB = contexts[id2];
                        const bindings = contextB.BINDED_TO;
                        for (let i=0; i < bindings.length; i++) {
                            contextA.registerCloseFor(bindings[i]);
                        }
                    }

                }
            }
        },

        runOption: function (ID, index) {
            const context = contexts[ID];
            const position = context.domReadyPosition;
            context.settings.options[index].onclick({lat: position.lat(), lng: position.lng()});
            context.close();
        },

        setSetting: function (setting, value) {
            settings[setting] = value;
        }
    };
}());

/**
 * Hacky way of creating a context menu by using and modifying an InfoWindow
 *
 * @author mattwright324
 */
class GmapsContextMenu {
    // Random ID so that multiple custom context menus can be used at the same time
    ID = '_' + Math.random().toString(36).substr(2, 9)

    // Coords not visible in map. Initially set to this location before context-menu CSS
    // has been added to the InfoWindow to prevent flicker of original style.
    POS_HIDDEN = {lat: -200, lng: 200}

    // InfoWindow being used as a context menu
    INFO_WINDOW = new google.maps.InfoWindow({
        disableAutoPan: true
    })

    DEFAULT_SETTINGS = {
        registerOpenForMap: true,
        registerCloseForMap: true
    }

    BINDED_TO = []

    // Store mouse rightclick location. Add context-menu CSS first then set location.
    domReadyPosition = {lat: 0, lng: 0}

    /**
     * @param map required, registers context menu for map
     * @param settings optional
     */
    constructor(map, settings = {}) {
        GmapsContext.register(this.ID, this);

        this.map = map;
        this.settings = settings;

        for (let key in this.DEFAULT_SETTINGS) {
            if (!this.settings.hasOwnProperty(key)) {
                this.settings[key] = this.DEFAULT_SETTINGS[key];
            }
        }

        if (this.settings.registerOpenForMap) {
            this.registerOpenFor(map);
        }
        if (this.settings.registerCloseForMap) {
            this.registerCloseFor(map);
        }

        this.updateOptions();

        // Listen
        const menu = this;
        google.maps.event.addListener(menu.INFO_WINDOW, "domready", function () {
            menu.updateOptions();

            const contextMenuEls = document.getElementsByClassName("context-menu-content");
            for (let i = 0; i < contextMenuEls.length; i++) {
                const iwT = contextMenuEls[i].parentElement.parentElement.parentElement.parentElement;
                iwT.classList.add("context-menu");
                iwT.setAttribute("oncontextmenu", "return false;")
            }

            // Set position once context-menu-css has been added
            menu.INFO_WINDOW.setPosition(menu.domReadyPosition);
        });
    }

    updateOptions() {
        const optionsHtml = [];
        if (!this.settings || !this.settings.options) {
            optionsHtml.push("<li style='color:lightgray'>No options added</li>")
        } else {
            for (let i = 0; i < this.settings.options.length; i++) {
                const option = this.settings.options[i];
                if (!option.hasOwnProperty("showWhen") || option.showWhen()) {
                    optionsHtml.push("<li onclick='GmapsContext.runOption(\"" + this.ID + "\", " + i + ")'>" + option.text + "</li>")
                }
            }
        }
        const html =
            "<div id='" + this.ID + "' class='context-menu-content'>" +
            "<ul>" + optionsHtml.join("") + "</ul>" +
            "</div>"
        this.INFO_WINDOW.setContent(html);
    }

    registerFor(mapOrShape) {
        this.registerOpenFor(mapOrShape);
        this.registerCloseFor(mapOrShape);
    }

    registerOpenFor(mapOrShape) {
        const menu = this;
        mapOrShape.addListener('rightclick', function (event) {
            menu.domReadyPosition = event.latLng;

            if (menu.INFO_WINDOW.getMap()) {
                menu.INFO_WINDOW.setPosition(menu.domReadyPosition);
            } else {
                menu.INFO_WINDOW.setPosition(menu.POS_HIDDEN)
                menu.INFO_WINDOW.open(menu.map);
            }
        });

        if (this.BINDED_TO.indexOf(mapOrShape) === -1) {
            this.BINDED_TO.push(mapOrShape);
            GmapsContext.onMenuRegister();
        }
    }

    registerCloseFor(mapOrShape) {
        const menu = this;
        mapOrShape.addListener('click', function (event) {
            menu.close();
        });

        if (this.BINDED_TO.indexOf(mapOrShape) === -1) {
            this.BINDED_TO.push(mapOrShape);
            GmapsContext.onMenuRegister();
        }
    }

    close() {
        this.INFO_WINDOW.close();
    }
}
