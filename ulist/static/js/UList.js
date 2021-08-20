/* global $, saveAs */

var UList = {
    app_running: false,
    api_error: false,

    app_init: function() {
        this.app_running = true;
        this.api_error = false;
    },
    set_api_key: function(key) {
        this.API_KEY = key;
    },
    app_reset: function() {
        this.app_running = false;
        this.api_error = false;
    },
    is_browser_compatible: function() {
        try {
            return !!new Blob();
        }
        catch(e) {
            return false;
        }
    },
    is_running: function() {
        return this.app_running;
    },
    get_script: function(url, callback_success, callback_error) {
        var head, script;

        head = document.getElementsByTagName("head")[0];

        script = document.createElement("script");
        script.defer = "defer";
        script.src = url;

        script.addEventListener("load", function() {
            head.removeChild(script);
            if("function" === typeof callback_success) {
                callback_success();
            }
        }, false);
        script.addEventListener("error", function() {
            head.removeChild(script);
            if("function" === typeof callback_error) {
                callback_error();
            }
        }, false);

        head.appendChild(script);
    },
    channel_valid_id: function(youtube_url) {
        // Example URLs:
        //
        // https://www.youtube.com/channel/UCK8sQmJBp8GCxrOtXWBpyEA
        var re = /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/,
            id;

        id = youtube_url.match(re);

        return (id === null) ? false : id[1];
    },
    channel_valid_username: function(youtube_url) {
        // Legacy /user/ URL: ASCII characters only; Plus numbers. Limited to 1-20 characters.
        // New /c/ URL: (almost) all known characters, including non-ASCII glyphs such as Japanese or Chinese; Plus numbers. Limited to ?-50 characters.
        //
        // Example URLs:
        //
        // https://www.youtube.com/c/Google
        // https://www.youtube.com/user/Google
        var re = /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:user|c)\/([^?/]{1,50})/,
            username;

        username = youtube_url.match(re);

        return (username === null) ? false : username[1];
    },
    playlist_valid_id: function(youtube_url) {
        // Example URLs:
        //
        // https://www.youtube.com/playlist?list=PLbpi6ZahtOH6tp-0_3b3ZSYY0c7hyL9br
        // https://www.youtube.com/watch?v=GJ26gAc7BtU&list=RDGJ26gAc7BtU
        // https://www.youtube.com/playlist?list=PLD475E7D526AB9198
        // https://www.youtube.com/playlist?list=RDFV4bzE3DOx8
        // https://www.youtube.com/playlist?list=OLAK5uy_kVuhIfpyIYsBhG52CWUrWaWcC2A4ZVPuM
        var re = /^(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be\.com\/(?:watch|playlist)\?)(?:.*&)?list=((?:RD|[FLOP]L)[a-zA-Z0-9_-]+)/,
            id;

        id = youtube_url.match(re);

        return (id === null) ? false : id[1];
    },
    api_playlist_default_url: function(callback_name) {
        var api_url;

        api_url = "https://www.googleapis.com/youtube/v3/playlists?" + 
            $.param({
                "alt": "json",
                // Being strictly specific
                "maxResults": 1,
                "prettyPrint": "false",
                "part": "contentDetails,snippet",
                // We only need necessary fields
                "fields": "items(id,snippet(publishedAt,channelId,title,description," +
                          "thumbnails(medium(url)),channelTitle),contentDetails(itemCount))",
                "callback": callback_name,
                "key": this.API_KEY
            });

        return api_url;
    },
    api_playlist_list_default_url: function(callback_name) {
        var api_url;

        api_url = "https://www.googleapis.com/youtube/v3/playlistItems?" +
            $.param({
                "alt": "json",
                "prettyPrint": "false",
                "maxResults": 50,
                "part": "snippet,contentDetails",
                // We only need necessary fields
                "fields": "nextPageToken,items(contentDetails(videoId))",
                "callback": callback_name,
                "key": this.API_KEY
            });

        return api_url;
    },
    api_channel_default_url: function(callback_name) {
        var api_url;

        api_url = "https://www.googleapis.com/youtube/v3/channels?" +
            $.param({
                "alt": "json",
                "prettyPrint" : "false",
                "part": "contentDetails,snippet,statistics",
                // We only need necessary fields
                "fields": "items(id,snippet(title,description,publishedAt,thumbnails(default(url)))," +
                          "contentDetails(relatedPlaylists(uploads))," +
                          "statistics(viewCount,subscriberCount,hiddenSubscriberCount,videoCount))",
                "callback": callback_name,
                "key": this.API_KEY
            });

        return api_url;
    },
    api_playlist_generate_url: function(callback_name, playlist_id) {
        return this.api_playlist_default_url(callback_name) + "&" + $.param({ "id": playlist_id });
    },
    api_playlist_list_generate_url: function(callback_name, playlist_id) {
        return this.api_playlist_list_default_url(callback_name) + "&" + $.param({ "playlistId": playlist_id });
    },
    api_channel_generate_url: function(callback_name, channel_id) {
        return this.api_channel_default_url(callback_name) + "&" + $.param({ "id": channel_id });
    },
    api_username_generate_url: function(callback_name, username) {
        return this.api_channel_default_url(callback_name) + "&" + $.param({ "forUsername": username });
    }
};

var UList_Data = {
    playlist: {},
    channel: {},
    init: function() {
        this.JSON = "";

        this.playlist = {
            "id": "",
            "owner_name": "",
            "owner_id": "",
            "title": "",
            "description": "",
            "published_at": "",
            "thumbnail": "",
            "total_videos": 0,
            "video_ids": [],
            "fetched_videos": 0,
            "next_page_token": ""
        };
        this.channel = {
            "id": "",
            "username": "",
            "title": "",
            "description": "",
            "created_at": "",
            "subscribers": 0,
            "thumbnail": "",
            "total_uploads": 0,
            "total_views": 0,
            "uploads_playlist": "",
            "video_ids": [],
            "fetched_videos": 0,
            "next_page_token": ""
        };
    },
    json_store: function(data) {
        this.JSON = data;
    },
    get_channel_id: function() {
        return this.channel.id;
    },
    get_channel_total_uploads: function() {
        return this.channel.total_uploads;
    },
    get_uploads_playlist: function() {
        return this.channel.uploads_playlist;
    },
    get_playlist_id: function() {
        return this.playlist.id;
    },
    get_playlist_title: function() {
        return this.playlist.title;
    },
    set_username: function(username) {
        this.channel.username = username;
    },
    generate_video_urls: function(obj) {
        var k, total = obj.video_ids.length, video_urls = "";

        for(k = 0; k < total; k++) {
            video_urls += "https://www.youtube.com/watch?v=" + obj.video_ids[k];

            if(k !== total - 1) {
                video_urls += "\r\n";
            }
        }
        return video_urls;
    }
};

var UList_HTML = {
    // Cached objects
    init: function() {
        this.file_downloaded = null;
        this.page_title = document.title;
        this.user_notify = true;
        this.audio_playing = false;

        this.objects = {
            main_site: document.getElementById("site-main"),
            main_form: document.getElementById("main-form"),
            main_input: document.getElementById("youtube-url"),
            btn_notify: document.getElementById("btn-notify"),
            div_notify: document.getElementById("audio-play"),
            btn_submit: document.getElementById("btn-submit"),
            btn_submit_icon: document.getElementById("btn-submit-icon"),
            div_limit: document.getElementById("result-limit"),
            btns_limit: document.getElementById("btns-result-limit"),
            div_result: document.getElementById("result-main"),
            div_progress: document.getElementById("info-progress"),
            progress_bar: document.getElementById("progress-bar"),
            progress_text: document.getElementById("progress-text"),
            div_download: document.getElementById("info-download"),
            btn_download: document.getElementById("btn-download")
        };
    },
    has_downloaded_file: function() {
        return this.file_downloaded;
    },
    site_disable: function() {
        $(this.objects.main_site).addClass("site-disable");
    },
    form_init: function() {
        var btn = this.objects.btn_submit, btn_icon = this.objects.btn_submit_icon;

        this.file_downloaded = null;
        btn.disabled = true;
        $(btn).removeClass("youtube-bg-btn");
        $(btn_icon).removeClass("glyphicon-play youtube-color-btn").addClass("glyphicon-refresh glyphicon-refresh-animate");
    },
    form_reset: function() {
        var btn = this.objects.btn_submit, btn_icon = this.objects.btn_submit_icon;

        btn.disabled = false;
        $(btn).addClass("youtube-bg-btn");
        $(btn_icon).removeClass("glyphicon-refresh glyphicon-refresh-animate").addClass("youtube-color-btn glyphicon-play");
    },
    show_popover_message: function(title, message) {
        var element = this.objects.main_input;

        $(element).popover({
            "trigger": "manual",
            "title": title,
            "content": message
        });
        $(element).popover("show");
    },
    hide_popover_message: function() {
        var element = this.objects.main_input;

        $(element).popover("destroy");
    },
    date_format: function(date_obj) {
        var months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        return (months[date_obj.getMonth()] + " de " + date_obj.getFullYear());
    },
    // Taken from PHPJS
    // http://phpjs.org/functions/number_format/
    number_format: function(number, decimals, dec_point, thousands_sep) {

        number = (number + "")
            .replace(/[^0-9+\-Ee.]/g, "");
        var n = !isFinite(+number) ? 0 : +number,
            prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
            sep = (typeof thousands_sep === "undefined") ? "," : thousands_sep,
            dec = (typeof dec_point === "undefined") ? "." : dec_point,
            s = "",
            toFixedFix = function(n, prec) {
                var k = Math.pow(10, prec);
                return "" + (Math.round(n * k) / k)
                    .toFixed(prec);
            };
        // Fix for IE parseFloat(0.55).toFixed(0) = 0;
        s = (prec ? toFixedFix(n, prec) : "" + Math.round(n))
            .split(".");
        if (s[0].length > 3) {
            s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
        }
        if ((s[1] || "")
            .length < prec) {
            s[1] = s[1] || "";
            s[1] += new Array(prec - s[1].length + 1)
                .join("0");
        }
        return s.join(dec);
    },
    locale_number_format: function(number, plus_sign) {
        var str, div, x, size,

        numbers = [1000, 1000000, 1000000000],
        singular = ["mil", "milhão", "bilhão"],
        plural = ["mil", "milhões", "bilhões"];

        size = numbers.length;
        str = number;

        for(x = 0; x < size; x++) {
            if(number >= numbers[x]) {
                str = "";
                div = Math.floor(number / numbers[x]);
                str += (0 === number % numbers[x]) ? div : ((true === plus_sign) ? (div + "+") : div);
                str += " ";
                str += (div > 1) ? plural[x] : singular[x];
            }
        }
        return str;
    },
    clean_div: function(div) {
        while(null !== div.firstChild) {
            div.removeChild(div.firstChild);
        }
    },
    create_button: function(parent, value, css_class) {
        var button;

        button = document.createElement("button");
        button.appendChild(document.createTextNode(value));
        button.className = css_class;
        parent.appendChild(button);

        return button;
    },
    handle_script_limit: function(success_callback) {
        var btns_div, btn_yes, btn_no;

        btns_div = this.objects.btns_limit;
        btn_yes = this.create_button(btns_div, "Sim", "btn btn-primary");
        btn_no  = this.create_button(btns_div, "Não", "btn btn-danger");

        btn_yes.addEventListener("click", function() {
            // Disables both buttons.
            btn_yes.disabled = true;
            btn_no.disabled = true;

            $(this.objects.div_limit).slideUp("slow", function() {
                // Removes both buttons.
                btns_div.removeChild(btn_yes);
                btns_div.removeChild(btn_no);

                // Calls callback function.
                success_callback();
            });
        }.bind(this), false);
        btn_no.addEventListener("click", function() {
            // Disables both buttons.
            btn_yes.disabled = true;
            btn_no.disabled = true;

            $(this.objects.div_limit).slideUp("slow", function() {
                // Removes both buttons.
                btns_div.removeChild(btn_yes);
                btns_div.removeChild(btn_no);

                // Resets everything.
                UList.app_reset();
                this.form_reset();
            }.bind(this));
        }.bind(this), false);

        $(this.objects.div_limit).slideDown("slow");
    },
    show_playlist_details: function() {
        var playlist, published,
            div_result = this.objects.div_result,
            div_progress = this.objects.div_progress,
            div_download = this.objects.div_download,
            div_tab, div_clear, div_infos, div_thumbnail, span, anchor, video_id,
            div_details, div_title, div_summary, div_description, ul, li;

        // First, store the information.
        playlist = UList_Data.JSON.items[0];

        UList_Data.playlist.id = playlist.id;
        UList_Data.playlist.owner_name = playlist.snippet.channelTitle;
        UList_Data.playlist.owner_id = playlist.snippet.channelId;
        UList_Data.playlist.title = playlist.snippet.title;
        UList_Data.playlist.description = playlist.snippet.description;

        // In some Channels, YouTube hides this value. As we don't know
        // if the same happens with Playlists, we need to do this sanity check.
        // This value can also be the start of the Unix Era: 1970-01-01T00:00:00.000Z
        if(playlist.snippet.publishedAt !== "1970-01-01T00:00:00.000Z") {
            published = new Date(playlist.snippet.publishedAt);
            published = (true === isNaN(published)) ? "" : published;
        }
        else {
            published = "";
        }
        UList_Data.playlist.published_at = published;

        // If we treat the "default" property literally, IE<9 doesn't even load this script.
        UList_Data.playlist.thumbnail = playlist.snippet.thumbnails["medium"].url;
        // XXX: We don't know if this value is 100% accurate.
        UList_Data.playlist.total_videos = playlist.contentDetails.itemCount;

        // Updates the URL.
        this.update_hash_url("playlist", UList_Data.playlist.id, UList_Data.playlist.title);

        // Hides previous results.
        $(div_result).hide();
        $(div_progress).hide();
        $(div_download).hide();
        this.reset_progress_bar();

        this.clean_div(div_result);

        // Tab name.
        div_tab = document.createElement("div");
        div_tab.className = "result-tab";
        div_tab.appendChild(document.createTextNode("Playlist"));
        div_result.appendChild(div_tab);

        // Clearfix.
        div_clear = document.createElement("div");
        div_clear.className = "clearfix";
        div_result.appendChild(div_clear);

        div_infos = document.createElement("div");
        div_infos.className = "result-infos";
        div_result.appendChild(div_infos);

        // Playlist's thumbnail.
        div_thumbnail = document.createElement("div");
        div_thumbnail.className = "result-thumbnail";
        div_thumbnail.style.backgroundImage = "url(" + UList_Data.playlist.thumbnail + ")";
        div_infos.appendChild(div_thumbnail);

        // Details div.
        div_details = document.createElement("div");
        div_details.className = "result-details";

        // Playlist's title.
        div_title = document.createElement("div");
        div_title.className = "result-title";

        // Playlist's URL.
        anchor = document.createElement("a");

        // If it's a YouTube's "Mix" Playlist, it wont't have a regular playlist link. We need to
        // append the playlist ID to a video URL inside that playlist, like this:
        //
        // https://www.youtube.com/watch?v=GJ26gAc7BtU&list=RDGJ26gAc7BtU
        //
        // How do we identify this kind of playlist? The two first characters *should be*: RD.
        if("R" === UList_Data.playlist.id[0] && "D" === UList_Data.playlist.id[1]) {
            // We will get video ID from the thumbnail URL.
            video_id = UList_Data.playlist.thumbnail.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
            video_id = null === video_id ? "dQw4w9WgXcQ" : video_id[1];

            anchor.href = "https://www.youtube.com/watch?v=" + video_id + "&list=" + UList_Data.playlist.id;
        }
        else {
            anchor.href = "https://www.youtube.com/playlist?list=" + UList_Data.playlist.id;
        }
        anchor.setAttribute("data-container", "body");
        anchor.setAttribute("data-toggle", "tooltip");
        anchor.setAttribute("data-placement", "top");
        anchor.title = UList_Data.playlist.title;
        anchor.target = "_blank";
        // Playlist's title.
        anchor.appendChild(document.createTextNode(UList_Data.playlist.title));
        div_title.appendChild(anchor);
        div_details.appendChild(div_title);

        // Playlist's Summary.
        div_summary = document.createElement("div");
        div_summary.className = "result-summary";

        // List containing the Summary.
        ul = document.createElement("ul");
        li = document.createElement("li");
        li.appendChild(document.createTextNode("por "));

        // Channel URL.
        anchor = document.createElement("a");
        anchor.href = "https://www.youtube.com/channel/" + UList_Data.playlist.owner_id;
        anchor.target = "_blank";
        // Channel title.
        anchor.appendChild(document.createTextNode(UList_Data.playlist.owner_name));
        li.appendChild(anchor);
        ul.appendChild(li);

        // Playlist's total videos.
        li = document.createElement("li");
        span = document.createElement("span");
        span.setAttribute("data-container", "body");
        span.setAttribute("data-toggle", "tooltip");
        span.setAttribute("data-placement", "bottom");
        span.title = "± " + this.number_format(UList_Data.playlist.total_videos, 0, ".", ".");
        span.appendChild(document.createTextNode(this.locale_number_format(UList_Data.playlist.total_videos) + (UList_Data.playlist.total_videos > 1 ? " vídeos" : " vídeo")));
        li.appendChild(span);
        ul.appendChild(li);

        // Playlist's last update date. (Optional)
        if("" !== UList_Data.playlist.published_at) {
            li = document.createElement("li");
            span = document.createElement("span");
            span.setAttribute("data-container", "body");
            span.setAttribute("data-toggle", "tooltip");
            span.setAttribute("data-placement", "bottom");
            span.title = UList_Data.playlist.published_at.toLocaleString();
            span.appendChild(document.createTextNode(this.date_format(UList_Data.playlist.published_at)));
            li.appendChild(span);
            ul.appendChild(li);
        }
        div_summary.appendChild(ul);
        div_details.appendChild(div_summary);

        // Playlist's description. (Optional)
        if("" !== UList_Data.playlist.description) {
            div_description = document.createElement("div");
            div_description.className = "result-description text-muted";
            div_description.appendChild(document.createTextNode(UList_Data.playlist.description));
            div_details.appendChild(div_description);
        }
        div_infos.appendChild(div_details);

        $('[data-toggle="tooltip"]').tooltip();
        $(div_result).slideDown("slow");
        $(div_progress).slideDown("slow");
    },
    show_channel_details: function() {
        var channel, creation,
            div_result = this.objects.div_result,
            div_progress = this.objects.div_progress,
            div_download = this.objects.div_download,
            div_tab, div_clear, div_infos, div_thumbnail, span, anchor,
            div_details, div_title, div_summary, div_description, ul, li;

        // First, store the informations.
        channel = UList_Data.JSON.items[0];
        UList_Data.channel.id = channel.id;
        UList_Data.channel.title = channel.snippet.title;
        creation = new Date(channel.snippet.publishedAt);
        UList_Data.channel.created_at = (true === isNaN(creation)) ? "" : creation;
        UList_Data.channel.subscribers = (true === channel.statistics.hiddenSubscriberCount) ? false : +channel.statistics.subscriberCount;
        // If we treat the "default" property literally, IE<9 doesn't even load this script.
        UList_Data.channel.thumbnail = channel.snippet.thumbnails["default"].url;
        UList_Data.channel.total_uploads = +channel.statistics.videoCount;
        UList_Data.channel.total_views = channel.statistics.viewCount;
        UList_Data.channel.uploads_playlist = channel.contentDetails.relatedPlaylists.uploads;

        // Updates the URL.
        if(UList_Data.channel.username !== "") {
            this.update_hash_url("user", UList_Data.channel.username, UList_Data.channel.title);
        }
        else {
            this.update_hash_url("channel", UList_Data.channel.id, UList_Data.channel.title);
        }

        // Hides the previous result.
        $(div_result).hide();
        $(div_progress).hide();
        $(div_download).hide();
        this.reset_progress_bar();

        // Removes child nodes from the result div.
        this.clean_div(div_result);

        // Tab name
        div_tab = document.createElement("div");
        div_tab.className = "result-tab";
        div_tab.appendChild(document.createTextNode("Canal"));
        div_result.appendChild(div_tab);

        // Clearfix
        div_clear = document.createElement("div");
        div_clear.className = "clearfix";
        div_result.appendChild(div_clear);

        div_infos = document.createElement("div");
        div_infos.className = "result-infos";
        div_result.appendChild(div_infos);

        // Channel Thumbnail.
        div_thumbnail = document.createElement("div");
        div_thumbnail.className = "result-thumbnail";
        div_thumbnail.style.backgroundImage = "url(" + UList_Data.channel.thumbnail + ")";
        div_infos.appendChild(div_thumbnail);

        // Details div.
        div_details = document.createElement("div");
        div_details.className = "result-details";

        // Channel's title.
        div_title = document.createElement("div");
        div_title.className = "result-title";

        // Channel's URL.
        anchor = document.createElement("a");
        if(UList_Data.channel.username !== "") {
            anchor.href = "https://www.youtube.com/user/" + UList_Data.channel.username;
        }
        else {
            anchor.href = "https://www.youtube.com/channel/" + UList_Data.channel.id;
        }
        anchor.target = "_blank";
        anchor.setAttribute("data-container", "body");
        anchor.setAttribute("data-toggle", "tooltip");
        anchor.setAttribute("data-placement", "top");
        anchor.title = UList_Data.channel.title;
        // Channel's title.
        anchor.appendChild(document.createTextNode(UList_Data.channel.title));
        div_title.appendChild(anchor);
        div_details.appendChild(div_title);

        // Channel's summary.
        div_summary = document.createElement("div");
        div_summary.className = "result-summary";

        // List containing the Summary.
        ul = document.createElement("ul");

        // Channel's creation date. (Optional)
        if("" !== UList_Data.channel.created_at) {
            li = document.createElement("li");
            span = document.createElement("span");
            span.appendChild(document.createTextNode(this.date_format(UList_Data.channel.created_at)));
            span.setAttribute("data-container", "body");
            span.setAttribute("data-toggle", "tooltip");
            span.setAttribute("data-placement", "bottom");
            span.title = UList_Data.channel.created_at.toLocaleString();
            li.appendChild(span);
            ul.appendChild(li);
        }

        // Channel's subscribers. (Optional)
        if(false !== UList_Data.channel.subscribers && 0 !== UList_Data.channel.subscribers) {
            li = document.createElement("li");
            span = document.createElement("span");
            span.appendChild(document.createTextNode(this.locale_number_format(UList_Data.channel.subscribers, false) + (1 === UList_Data.channel.subscribers ? " inscrito" : " inscritos")));
            span.setAttribute("data-container", "body");
            span.setAttribute("data-toggle", "tooltip");
            span.setAttribute("data-placement", "bottom");
            span.title = "± " + this.number_format(UList_Data.channel.subscribers, 0, ".", ".");
            li.appendChild(span);
            ul.appendChild(li);
        }

        // Channel's total uploaded videos.
        li = document.createElement("li");
        span = document.createElement("span");
        span.appendChild(document.createTextNode(this.locale_number_format(UList_Data.channel.total_uploads, false) + (UList_Data.channel.total_uploads > 1 ? " vídeos" : " vídeo")));
        span.setAttribute("data-container", "body");
        span.setAttribute("data-toggle", "tooltip");
        span.setAttribute("data-placement", "bottom");
        span.title = "± " + this.number_format(UList_Data.channel.total_uploads, 0, ".", ".");
        li.appendChild(span);
        ul.appendChild(li);

        // Channel's total video views. (Optional)
        if(0 !== UList_Data.channel.total_views) {
            li = document.createElement("li");
            span = document.createElement("span");
            span.appendChild(document.createTextNode(this.locale_number_format(UList_Data.channel.total_views, false) + (1 === UList_Data.channel.total_views ? " visualização" : " visualizações")));
            span.setAttribute("data-container", "body");
            span.setAttribute("data-toggle", "tooltip");
            span.setAttribute("data-placement", "bottom");
            span.title = "± " + this.number_format(UList_Data.channel.total_views, 0, ".", ".");
            li.appendChild(span);
            ul.appendChild(li);
        }

        div_summary.appendChild(ul);
        div_details.appendChild(div_summary);
        // Channel's description. (Optional)
        if("" !== UList_Data.channel.description) {
            div_description = document.createElement("div");
            div_description.className = "result-description text-muted";
            div_description.appendChild(document.createTextNode(UList_Data.channel.description));
            div_details.appendChild(div_description);
        }
        div_infos.appendChild(div_details);

        $('[data-toggle="tooltip"]').tooltip();
        $(div_result).slideDown("slow");
        $(div_progress).slideDown("slow");
    },
    list_playlist_videos: function(playlist_id) {
        var api_url;

        api_url = UList.api_playlist_list_generate_url("UList_HTML.playlist_parse", playlist_id);

        if("" !== UList_Data.playlist.next_page_token) {
            api_url += "&" + $.param({ "pageToken": UList_Data.playlist.next_page_token });
        }
        UList.get_script(api_url, undefined, function() {
            this.handle_script_error("Playlist", 10, function() {
                this.list_playlist_videos(UList_Data.get_playlist_id());
            }.bind(this));
        }.bind(this));
    },
    list_channel_videos: function(uploads_playlist) {
        var api_url;

        api_url = UList.api_playlist_list_generate_url("UList_HTML.channel_parse", uploads_playlist);

        if("" !== UList_Data.channel.next_page_token) {
            api_url += "&" + $.param({ "pageToken": UList_Data.channel.next_page_token });
        }
        UList.get_script(api_url, undefined, function() {
            this.handle_script_error("Channel", 10, function() {
                this.list_channel_videos(UList_Data.get_uploads_playlist());
            }.bind(this));
        }.bind(this));
    },
    handle_script_error: function(type, sleep, callback) {
        var interval, pbar, ptext;

        console.log("[" + type + "] YouTube API Error. Sleeping " + sleep + "s before next request.");

        pbar = this.objects.progress_bar;
        ptext = this.objects.progress_text;

        $(pbar).addClass("progress-bar-danger").removeClass("progress-bar-info");
        
        interval = setInterval(function() {
            sleep--;

            if(sleep === 0) {
                clearInterval(interval);
                ptext.textContent = "";
                $(pbar).addClass("progress-bar-info").removeClass("progress-bar-danger");
                callback();
            }
            else {
                ptext.textContent = "(Erro! Tentando novamente em " + sleep + "s)";
            }
        }.bind(this), 1000);
    },
    playlist_parse: function(data) {
        var items, item, total, k, real_total, percent;

        // Internal YouTube API Error.
        if("undefined" !== typeof data.error) {
            this.handle_script_error("Playlist", 10, function() {
                this.list_playlist_videos(UList_Data.get_playlist_id());
            }.bind(this));
            return;
        }
        items = data.items;
        total = items.length;

        for(k = 0; k < total; k++) {
            item = items[k].contentDetails;

            UList_Data.playlist.video_ids.push(item.videoId);
        }
        UList_Data.playlist.fetched_videos += total;

        real_total = (UList_Data.playlist.total_videos > 100000) ? 100000 : UList_Data.playlist.total_videos;
        percent = UList_Data.playlist.fetched_videos / real_total * 100;

        this.set_progressbar_value(percent, UList_Data.playlist.title);

        if("undefined" === typeof data.nextPageToken) {
            UList.app_reset();
            this.form_reset();

            this.finish_progress_bar(UList_Data.playlist.title);

            $(this.objects.div_download).show("slow", function() {
                this.bind_download(UList_Data.playlist.title, UList_Data.playlist);
                this.notify_user();
            }.bind(this));
        }
        else {
            UList_Data.playlist.next_page_token = data.nextPageToken;
            this.list_playlist_videos(UList_Data.get_playlist_id());
        }
    },
    channel_parse: function(data) {
        var items, item, total, k, real_total, percent;

        // Internal YouTube API Error.
        if("undefined" !== typeof data.error) {
            this.handle_script_error("Channel", 10, function() {
                this.list_channel_videos(UList_Data.get_uploads_playlist());
            }.bind(this));
            return;
        }
        items = data.items;
        total = items.length;

        for(k = 0; k < total; k++) {
            item = items[k].contentDetails;

            UList_Data.channel.video_ids.push(item.videoId);
        }
        UList_Data.channel.fetched_videos += total;

        real_total = (UList_Data.channel.total_uploads > 99999) ? 100000 : UList_Data.channel.total_uploads;
        percent = UList_Data.channel.fetched_videos / real_total * 100;

        this.set_progressbar_value(percent, UList_Data.channel.title);

        if("undefined" === typeof data.nextPageToken) {
            UList.app_reset();
            this.form_reset();

            this.finish_progress_bar(UList_Data.channel.title);

            $(this.objects.div_download).show("slow", function() {
                this.bind_download(UList_Data.channel.title, UList_Data.channel);
                this.notify_user();
            }.bind(this));
        }
        else {
            UList_Data.channel.next_page_token = data.nextPageToken;
            this.list_channel_videos(UList_Data.get_uploads_playlist());
        }
    },
    reset_progress_bar: function() {
        var pbar, ptext;

        document.title = this.page_title;
        ptext = this.objects.progress_text;
        pbar = this.objects.progress_bar;

        ptext.textContent = "";
        $(pbar).addClass("active progress-bar-info").removeClass("progress-bar-success");
        this.set_progressbar_value(0);
    },
    finish_progress_bar: function(title) {
        var pbar, ptext;

        ptext = this.objects.progress_text;
        pbar = this.objects.progress_bar;

        ptext.textContent = "(Finalizado!)";
        $(pbar).addClass("progress-bar-success").removeClass("active progress-bar-info");

        this.set_progressbar_value(100, title);
    },
    set_progressbar_value: function(percent, title) {
        var int_val = Math.floor(percent), pbar;

        if("undefined" !== typeof title) {
            document.title = int_val + "% · " + title + " - " + this.page_title;
        }
        pbar = this.objects.progress_bar;

        pbar.style.width = int_val + "%";
        pbar.setAttribute("aria-valuenow", int_val);
        pbar.textContent = (((int_val > 9 && 0 === int_val % 10) ? int_val : percent.toFixed(2)) + "%");
    },
    bind_download: function(title, content) {
        this.file_downloaded = false;

        this.objects.btn_download.onclick = function() {
            var blob, video_urls;

            this.file_downloaded = true;

            video_urls = UList_Data.generate_video_urls(content);

            //blob = new Blob([video_urls], {
            //    type: "text/plain; charset=utf-8"
            //});
            //saveAs(blob, title.replace(/[\\\/:*?"<>|]/g, "") + ".txt");
            saveTextAs(video_urls, title.replace(/[\\\/:*?"<>|]/g, "") + ".txt");
        }.bind(this);
    },
    notify_user: function(force) {
        if((true === this.user_notify || true === force) && false === this.audio_playing) {
            this.objects.div_notify.play();
            this.audio_playing = true;
            this.objects.div_notify.onended = function() {
                this.audio_playing = false;
            }.bind(this);
        }
    },
    clear_notify: function() {
        this.audio_playing = false;
    },
    handle_hash_url: function() {
        var hash = window.location.hash,
            has_match = true, match, url,
            main_input = this.objects.main_input,
            btn_submit = this.objects.btn_submit;

        if(true === UList.is_running) {
            return;
        }
        if((match = hash.match(/^#!\/channel\/(UC[a-zA-Z0-9_-]{22})$/)) !== null) {
            url = "https://www.youtube.com/channel/" + match[1];
        }
        else if((match = hash.match(/^#!\/user\/([^?/]{1,50})$/)) !== null) {
            url = "https://www.youtube.com/user/" + match[1];
        }
        else if((match = hash.match(/^#!\/playlist\/((?:RD|[FPL]L)[a-zA-Z0-9_-]+)$/)) !== null) {
            url = "https://www.youtube.com/playlist?list=" + match[1];
        }
        else {
            has_match = false;
        }
        if(true === has_match) {
            this.hide_popover_message();
            main_input.value = url;
            btn_submit.click();
        }
    },
    update_hash_url: function(type, value, page_title) {
        window.location.hash = "#!/" + type + "/" + value;
        document.title = page_title + " - " + this.page_title;
    },
};

$(document).ready(function() {
    var main_form, main_input, btn_notify, interval, hovering = false;

    $('[data-toggle="tooltip"]').tooltip();
    UList_HTML.init();

    main_form  = UList_HTML.objects.main_form;
    main_input = UList_HTML.objects.main_input;
    btn_notify = UList_HTML.objects.btn_notify;

    UList.set_api_key("AIzaSyCYekyul-Oh1O2F-vdEhbUubjj4VuWy0b8");

    main_input.addEventListener("input", function() {
        // Workaround for IE bug (#856700)
        if(document.activeElement !== main_input) {
            return false;
        }
        UList_HTML.hide_popover_message();
    }, false);

    window.addEventListener("beforeunload", function(evt) {
        var msg;

        if(true === UList.is_running()) {
            msg = "O site ainda não terminou de criar a lista de links.";
        }
        if(false === UList_HTML.has_downloaded_file()) {
            msg = "Você ainda não baixou o arquivo.";
        }
        if("undefined" !== typeof msg) {
            (evt || window.event).returnValue = msg;
            return msg;
        }            
    }, false);

    btn_notify.addEventListener("click", function() {
        if(true === $(btn_notify).hasClass("glyphicon-volume-up")) {
            UList_HTML.user_notify = false;
            $(btn_notify).addClass("glyphicon-volume-off").removeClass("glyphicon-volume-up");
        }
        else if(true === $(btn_notify).hasClass("glyphicon-volume-off")) {
            UList_HTML.user_notify = true;
            $(btn_notify).addClass("glyphicon-volume-up").removeClass("glyphicon-volume-off");
        }
    }, false);

    btn_notify.addEventListener("mouseover", function() {
        hovering = true;
        interval = setTimeout(function() {
            if(true === hovering && false === UList_HTML.audio_playing) {
                UList_HTML.notify_user();
            }
        }, 500);
    }, false);
    btn_notify.addEventListener("mouseout", function() {
        clearInterval(interval);
        hovering = false;
    }, false);

    // On form submit...
    main_form.addEventListener("submit", function(evt) {
        var youtube_url = main_input.value.trim(), ret, api_url = "";

        evt.preventDefault();

        if(false === UList.is_browser_compatible()) {
            return;
        }
        if(true === UList.is_running()) {
            console.log("Script already running.");
            return;
        }
        UList_Data.init();
        UList_HTML.form_init();
        UList.app_init();

        // Is it a "/playlist" URL?
        if((ret = UList.playlist_valid_id(youtube_url)) !== false) {
            api_url = UList.api_playlist_generate_url("UList_Data.json_store", ret);

            UList.get_script(api_url, function() {
                var error = true;

                if("undefined" !== typeof UList_Data.JSON.error) {
                    // Internal YouTube API error.
                    console.log("[Playlist] Internal YouTube API error.");

                    UList_HTML.show_popover_message("Oops", "Ocorreu um erro desconhecido. Tente novamente.");
                }
                else if(1 !== UList_Data.JSON.items.length) {
                    // Playlist doesn't exist.
                    console.log("[Playlist] Playlist '" + youtube_url + "' doesn't exist or is private.");

                    UList_HTML.show_popover_message("Erro", "Esta playlist não existe ou é privada.");
                }
                else if(0 === +UList_Data.JSON.items[0].contentDetails.itemCount) {
                    // Playlist has no videos.
                    console.log("[Playlist] Playlist '" + youtube_url + "' has no videos.");

                    UList_HTML.show_popover_message("Aviso", "Esta playlist não tem vídeos.");
                }
                else if(+UList_Data.JSON.items[0].contentDetails.itemCount > 100000) {
                    // YouTube has a limitation of 100.000 videos that can be listed.
                    // So we ask the user if he wants only these 100.000.
                    console.log("[Playlist] Playlist '" + youtube_url + "' has more than 100.000 videos.");
                    error = false;

                    // If the user presses the 'Yes' button, then we start listing the videos.
                    UList_HTML.handle_script_limit(function() {
                        UList_HTML.show_playlist_details();
                        UList_HTML.list_playlist_videos(UList_Data.get_playlist_id());
                    });
                }
                else {
                    // Everything is fine.
                    error = false;

                    // Here we start to list all playlist's videos.
                    UList_HTML.show_playlist_details();
                    UList_HTML.list_playlist_videos(UList_Data.get_playlist_id());
                }
                if(true === error) {
                    UList.app_reset();
                    UList_HTML.form_reset();
                }
            },
            function() {
                // Network error.
                console.log("[Playlist] Network error.");

                UList_HTML.show_popover_message("Erro de conexão", "Verifique sua conexão com a Internet e tente novamente.");

                UList.app_reset();
                UList_HTML.form_reset();
            });
            return;
        }
        // Is it a "/channel/" URL?
        else if((ret = UList.channel_valid_id(youtube_url)) !== false) {
            api_url = UList.api_channel_generate_url("UList_Data.json_store", ret);
        }
        // Is it a "/user/" or "/c/" URL?
        else if((ret = UList.channel_valid_username(youtube_url)) !== false) {
            api_url = UList.api_username_generate_url("UList_Data.json_store", ret);
            UList_Data.set_username(ret);
        }
        if("" === api_url) {
            // Unknown URL.
            console.log("Unknown Youtube URL '" + youtube_url + "'");

            UList_HTML.show_popover_message("Erro", "Informe um link válido.");

            UList.app_reset();
            UList_HTML.form_reset();
        }
        else {
            UList.get_script(api_url, function() {
                var error = true;

                if("undefined" !== typeof UList_Data.JSON.error) {
                    // Internal YouTube API error.
                    console.log("[Channel] Internal YouTube API error.");

                    UList_HTML.show_popover_message("Oops", "Ocorreu um erro desconhecido. Tente novamente.");
                }
                else if(1 !== UList_Data.JSON.items.length) {
                    // Channel doesn't exist.
                    console.log("[Channel] Channel '" + youtube_url + "' doesn't exist.");

                    UList_HTML.show_popover_message("Erro", "Este canal não existe.");
                }
                else if(0 === +UList_Data.JSON.items[0].statistics.videoCount) {
                    // Channel has no videos.
                    console.log("[Channel] Channel '" + youtube_url + "' has no videos.");

                    UList_HTML.show_popover_message("Aviso", "Este canal não enviou vídeos.");
                }
                else if(+UList_Data.JSON.items[0].statistics.videoCount > 100000) {
                    // YouTube has a limitation of 100.000 videos that can be listed.
                    // So we ask the user if he wants only these 100.000.
                    console.log("[Channel] Channel '" + youtube_url + "' has more than 100.000 uploaded videos.");
                    error = false;

                    // If the user press the 'Yes' button, then we start listing the videos.
                    UList_HTML.handle_script_limit(function() {
                        UList_HTML.show_channel_details();
                        UList_HTML.list_channel_videos(UList_Data.get_uploads_playlist());
                    });
                }
                else {
                    // Everything is fine.
                    error = false;

                    // Here we start to list all channel's uploaded videos.
                    UList_HTML.show_channel_details();
                    UList_HTML.list_channel_videos(UList_Data.get_uploads_playlist());
                }
                if(true === error) {
                    UList.app_reset();
                    UList_HTML.form_reset();
                }
            },
            function() {
                // Network error.
                console.log("[Channel] Network error.");

                UList_HTML.show_popover_message("Erro de conexão", "Verifique sua conexão com a Internet e tente novamente.");

                UList.app_reset();
                UList_HTML.form_reset();
            });
        }
    }, false);

    UList_HTML.handle_hash_url();
    window.addEventListener("hashchange", function() {
        if(false === UList.is_running()) {
            UList_HTML.handle_hash_url();
        }
    }, false);
});
