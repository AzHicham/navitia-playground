// Copyright (c) 2016 CanalTP
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

function setStatus(xhr, start_time) {
    var status = sprintf('Status: %s (%s)', xhr.statusText, xhr.status);
    if (typeof start_time === 'number') {
        var duration = new Date().getTime() - start_time;
        status += sprintf(', duration of the request: %sms', duration);
    }
    $('#status').html(status);
}

function responseCollectionName(json) {
    var key = null;
    var notCollectionKeys = ['disruptions', 'links', 'feed_publishers', 'exceptions', 'notes', 'warnings'];
    for (var k in json) {
        if ($.isArray(json[k]) &&
            $.inArray(k, notCollectionKeys) === -1) {
            key = k;
        }
    }
    // disruptions may be an object list only if there is no other object list
    if (key === null && 'disruptions' in json) {
        key = 'disruptions';
    }
    return key;
}

function makeObjectButton(name, handle) {
    // TODO call handle on toggle
    return $('<label>')
        .addClass('objectButton')
        .append($('<input type="checkbox">').change(handle))
        .append($('<span>').html(name));
}

function makeObjectButtonHandle(selector, renderHandle) {
    return function() {
        var div = $(this).closest('div.object').children('div.data').children(selector);
        if ($(this).is(':checked')) {
            div.hide();
            div.removeClass('not_filled');
            div.html(renderHandle());
            div.slideDown(600);
        } else {
            div.slideUp(600, function() {
                div.addClass('not_filled');
                div.empty();
            });
        }
    };
}

function render(context, json, type, key, idx) {
    var name = key;
    if (typeof idx === 'number') { name += sprintf('[%s]', idx); }
    name = context.makeLink(key, json, name);

    var head = $('<div class="head">');
    head.append($('<div class="name">').html(name));
    head.append($('<div class="summary">').html(summary.run(context, type, json)));
    var button = $('<div class="button">');
    if (extended.hasExtended(context, type, json)) {
        button.append(makeObjectButton('Ext', makeObjectButtonHandle('div.extended', function() {
                    return extended.run(context, type, json);
                })))
    }
    if (map.hasMap(context, type, json)) {
        button.append(makeObjectButton('Map', makeObjectButtonHandle('div.map', function() {
                    return map.run(context, type, json);
                })))
    }
    button.append(makeObjectButton('{ }', makeObjectButtonHandle('div.code', function() {
        return renderjson(json);
    })));
    head.append(button);

    var data = $('<div class="data">')
        .append($('<div class="extended not_filled">'))
        .append($('<div class="map not_filled">'))
        .append($('<div class="code not_filled">'));

    var result = $('<div class="object">');
    result.append(head);
    result.append(data);
    return result;
}

function Context(data) {
    // the token, used to create links
    var token = URI(window.location).search(true).token;

    // the regex corresponding to the thing that should be replacced
    // in a templated link
    var templateRegex = /\{.*\.id\}/;

    // the link map: type -> template
    this.links = {};
    if (data instanceof Object && 'links' in data && $.isArray(data.links)) {
        var self = this;
        data.links.forEach(function(link) {
            if (! link.templated) { return; }
            if (link.type === 'related') { return; }
            if (! link.href.match(templateRegex)) { return; }
            self.links[getType(link.type)] = link.href;
        });
    }

    this.makeHref = function(href) {
        var res = sprintf('?request=%s', encodeURIComponent(href));
        if (token) {
            res += sprintf('&token=%s', encodeURIComponent(token));
        }
        return res;
    };

    this.makeLink = function(k, obj, name) {
        var key = getType(k);
        if (! (key in this.links) || ! ('id' in obj)) {
            return $('<span/>').html(name);
        }
        var href = this.links[key].replace(templateRegex, obj.id);
        return $('<a>').attr('href', this.makeHref(href)).html(name);
    };

    this.color_isochrone = function() {
      if ('isochrones' in data) {
        var min_duration = [];
        data.isochrones.forEach(function(isochrone) {
          min_duration.push(isochrone.min_duration);
        });
        var green = '00FF00';
        var red = 'FF0000';
        var max_isochrone = data.isochrones.length;
        var color_min_duration = new Map();
        for (var i = 0; i < max_isochrone; i ++) {
          var ratio = i / (max_isochrone - 1);
          var g = 255;
          var r = 255;
          if (ratio < 1/2) {
            g = Math.ceil(parseInt(green.substring(2,4), 16) * 2 * ratio);
          } else {
            r = Math.ceil(parseInt(red.substring(0,2), 16) * 2 * (1 - ratio));
          }

          var hex = sprintf("%02x%02x%02x", r, g, 0);
          console.log(hex);
          color_min_duration.set(min_duration[i], { color: hex })
        }
        return color_min_duration;
      }
    }
}

function manage_token (token) {
  return token ? { Authorization: 'Basic ' + btoa(token) } : {};
}

$(document).ready(function() {
    var request = parseUrl();
    if (request === null) {
        $('#data').html('No request');
        return;
    }
    renderjson.set_show_to_level(3);
    renderjson.set_max_string_length(60);
    renderjson.set_sort_objects(true);
    var start_time = new Date().getTime();
    $.ajax({
        headers: manage_token(request.token),
        url: request.request,
        dataType: 'json',
    }).then(
        function(data, status, xhr) {
            setStatus(xhr, start_time);
            $('#data').html(render(new Context(data), data, 'response', 'response'));
            $('#data input').first().click();
            saveToken(request.api, request.token);
            // update the drop list of autocompletion for API
            autocomplete.apiAutocomplete();
        },
        function(xhr, status, error) {
            setStatus(xhr, start_time);
            $('#data').html(render(new Context(), xhr.responseJSON, 'error', 'response'));
            $('#data input').last().click();
            notifyOnError(xhr, 'Response');
        }
    );
});
