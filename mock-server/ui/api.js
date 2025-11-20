

export class UI {
    constructor() {

    }

    // All responses should follow this generic schema that offers a few different UI screens to choose from
    //   {
    //     "schema": "vrc-media-ui",
    //     "version": 1,
    //     "screenType": "grid",      // "grid" | "list" | "details" | "rows" | "error"
    //     "title": "Recently Added", // optional but recommended
    //     "subtitle": null,          // optional
    //     "theme": {
    //       "accent": "#ff99ff",     // optional; UI can ignore
    //       "posterAspect": 0.6667   // width/height; e.g. 2:3 posters
    //     },
    //     "actions": {
    //       "back": "/home",         // what to load when user presses “back”
    //       "home": "/home"          // optional global action targets
    //     },
      
    //     // one of the following depending on screenType:
    //     "items": [],               // for grid/list
    //     "rows": [],                // for rows screen
    //     "item": {}                 // for details screen
    //   }
    handleAPIRequest (_req, res) {
        const query = (_req && _req.query) ? _req.query : {};
        let route = (typeof query.route === "string" && query.route.trim().length > 0)
            ? query.route.trim()
            : "/home";

        if (route === "/") {
            route = "/home";
        } else if (!route.startsWith("/")) {
            route = `/${route}`;
        }

        const staticRoutes = new Map([
            ["/home", this.home.bind(this)],
            ["/grid", this.grid.bind(this)],
            ["/list", this.list.bind(this)],
            ["/search", this.search.bind(this)]
        ]);

        if (staticRoutes.has(route)) {
            return staticRoutes.get(route)(_req, res);
        }

        if (route.startsWith("/section/")) {
            return this.grid(_req, res);
        }

        if (route.startsWith("/item/")) {
            return this.mediaDetails(_req, res);
        }

        return this.errorScreen(_req, res);
    }

    randomItem (action = "navigate") {
        if (action == "navigate") {
            return {
                "id": "12345",                  // opaque; nice for logging but not required by client
                "label": "Inception",           // main title
                "subLabel": "2010 · Movie",     // secondary line
                "thumb": "/imgs/movies/12345/poster.jpg",
                "route": "/item/12345",         // where to go when selected, if primaryAction == "navigate"
                "action": "navigate",           // "navigate" | "play"
                "stream": null,                 // stream URL if primaryAction == "play"
            }
        } else if (action == "play") {
            return {
                "id": "12345",                  // opaque; nice for logging but not required by client
                "label": "Inception",           // main title
                "subLabel": "2010 · Movie",     // secondary line
                "thumb": "/imgs/movies/12345/poster.jpg",
                "route": "",                    // where to go when selected, if primaryAction == "navigate"
                "action": "play",               // "navigate" | "play"
                "stream": "/stream/movies/12345.m3u8", // stream URL if primaryAction == "play"
            }
        }
    }

    home (_req, res) {
        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "rows",
            "title": "Home",
            "rows": [
                {
                    "title": "Continue Watching",
                    "layout": "row",                  // "row" or "grid"; up to you
                    "items": [ this.randomItem("navigate") ]
                },
                {
                    "title": "Recently Added Movies",
                    "layout": "row",
                    "items": [ this.randomItem("navigate") ]
                }
            ]
        });
    }

    grid (_req, res) {
        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "grid",
            "title": "Movies",
            "subtitle": "All Movies in Plex",
            "items": [
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate")
                // more...
            ],
            "pagination": {
                "cursorNext": "/movies?page=3",
                "cursorPrev": "/movies?page=1"
            }
        })
    }

    search (_req, res) {
        const q = (_req && _req.query && typeof _req.query.q === "string")
            ? _req.query.q.trim()
            : "";
        const hasQuery = q.length > 0;

        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "grid",
            "title": hasQuery ? `Search results for "${q}"` : "Search",
            "subtitle": hasQuery ? null : "Try searching for a title to get started",
            "items": [
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate"),
                this.randomItem("navigate")
            ],
            "actions": {
                "back": "/home",
                "home": "/home"
            }
        });
    }

    list (_req, res) {
        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "list",
            "title": "Seasons",
            "items": [
              {
                "id": "season-1",
                "label": "Season 1",
                "subLabel": "10 episodes",
                "thumb": "/imgs/tv/12345/season/1/poster.jpg",
                "badge": null,
                "route": "/tv/12345/season/1",
                "primaryAction": "navigate",
                "stream": null
              }
            ]
        })
    }

    mediaDetails (_req, res) {
        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "details",
            "title": "Inception",
            "item": {
              "id": "12345",
              "label": "Inception",
              "subLabel": "2010 · 2h 28m",
              "thumb": "/imgs/movies/12345/poster.jpg",
              "description": "A thief who steals corporate secrets...",
              "background": "/imgs/movies/12345/background.jpg",
              "actions": [
                {
                  "label": "Play",
                  "action": "play",
                  "stream": "/stream/movies/12345.m3u8"
                }
              ]
            },
            "extraRows": [
              {
                "title": "More Like This",
                "layout": "row",
                "items": [ 
                    this.randomItem("navigate"),  
                    this.randomItem("navigate"),  
                    this.randomItem("navigate")
                ]
              }
            ]
        })        
    }

    errorScreen (_req, res) {
        res.json({
            "schema": "vrc-media-ui",
            "version": 1,
            "screenType": "error",
            "title": "Error",
            "subtitle": "Unable to contact the media server.",
            "errorCode": "NETWORK",
            "message": "Please try again later :(",
            "actions": {
                "back": "/home"
            }
        })
    }
}