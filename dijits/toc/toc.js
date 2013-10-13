
define([
    "dojo/_base/declare",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/parser",
    "dojo/dom",
    "dojo/_base/array",
    "dijit/form/HorizontalSlider",
    "dijit/Dialog",
    "dojo/on",
    "dojo/dom-construct",
    "dijit/form/CheckBox",
    "dojox/storage",
    "dojox/json/query",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "esri/request"
], function (declare,
    _WidgetBase,
    _TemplatedMixin,
    parser,
    dom,
    array,
    HorizontalSlider,
    Dialog,
    on,
    domConstruct,
    CheckBox,
    storage,
    query,
    ArcGISDynamicMapServiceLayer,
    esriRequest) {

    parser.parse();

    var _DialogNode = declare([_WidgetBase, _TemplatedMixin], {
        templateString: '<div data-dojo-attach-point="rowNode"><span data-dojo-attach-point="labelNode"></span></div>',
        layerName: null,
        layerId: null,
        checked: false,
        constructor: function (layerName, layerId, checked) {
            this.layerName = layerName;
            this.layerId = layerId;
            this.checked = checked;
        },
        postCreate: function () {
            var box = new CheckBox({
                value: "toc_" + this.layerId,
                checked: this.checked
            });
            box.placeAt(this.rowNode, "first");
            this.labelNode.innerHTML = this.layerName;
        }
    });


    var _TOCnode = declare([_WidgetBase, _TemplatedMixin], {
        templateString: '<div data-dojo-attach-point="rowNode"><span data-dojo-attach-point="labelNode"></span></div>',
        layerName: null,
        layerId: null,
        serviceLayer: null,
        checked: false,
        constructor: function (layerName, layerId, checked) {
            this.id = "toc_" + layerId,
            this.layerName = layerName;
            this.layerId = layerId;
            this.checked = checked;
        },
        postCreate: function () {
            var box = new CheckBox({
                value: "toc_" + this.layerId,
                checked: this.checked
            });
            this.checkNode = box;
            box.placeAt(this.rowNode, "first");
            this.labelNode.innerHTML = this.layerName;
        }
    });


    return declare([_WidgetBase], {
        dialog: null,
        layers: [],
        storageProvider: null,
        tocDomNode: null,
        opacityLayer: null,
        constructor: function (params) {
            declare.safeMixin(this, params);
            this.storageProvider = dojox.storage.manager.getProvider()
        },
        // extension point. called automatically after widget DOM ready.
        postCreate: function () {

            domConstruct.empty(this.domNode);
            var tocDomNode = domConstruct.create("div", { id: "uxTocLayerDiv", style: "margin-top:20px;" });
            domConstruct.place(tocDomNode, this.domNode);
            this.tocDomNode = dom.byId("uxTocLayerDiv");

            this.opacityLayer = new ArcGISDynamicMapServiceLayer(this.serviceLayer.url);
            this.opacityLayer.setOpacity(0.65);
            this.map.addLayer(this.opacityLayer);

            this._makeTOC();

            this.map.addLayer(this.serviceLayer);
            this.serviceLayer.setVisibleLayers([-1]);
            this.storageProvider.initialize();
            
            var me = this;
            on(this.map, 'zoom-end', function () {
                me._setTOCstyle();
            });


        },
        _makeTOC: function () {
            var me = this;

            //-- Create a Dialog with available layers to choose from
            this.dialog = new Dialog({
                id: "uxLayersDialog",
                title: "Available Layers"
            });

            on(this.dialog, 'click', function (evt) {
                if (evt.target.type === 'checkbox') {
                    if (evt.target.checked) {
                        me._addToTOC(evt.target);
                    } else {
                        me._removeFromTOC(evt.target);
                    };
                }
            });

            on(this.domNode, 'click', function (evt) {
                if (evt.target.type === 'checkbox') {
                    if (evt.target.checked) {
                        me._showOnMap(evt.target);
                    } else {
                        me._hideOnMap(evt.target);
                    };
                }
            });

            //-- populate the TOC and the Dialog
            this._getServiceLayers();
            var IESliderTimeout;
            var slider = new HorizontalSlider({
                name: "slider",
                value:35,
                minimum: 0,
                maximum: 100,
                intermediateChanges: true,
                style: "width:200px;",
                onChange: function (value) {
                    var newOp = (value / 100);
                    me.opacityLayer.setOpacity(1 - newOp);
                    dom.byId("uxSliderValue").innerHTML = Math.round(value) + '%';
                    if (dojo.isIE <= 10) {
                        clearTimeout(IESliderTimeout);
                        IESliderTimeout = setTimeout(function () { me.opacityLayer.refresh(); }, 500);
                    } // IE fix for slider opacity not working.
                }
            });

            slider.placeAt(this.domNode, "first");
            var sliderValue = domConstruct.toDom('<div style="margin-bottom: 10px;">Layers Transparency: <span id="uxSliderValue">35%</span></div>');
            domConstruct.place(sliderValue, this.domNode, "first");

        },
        _getServiceLayers: function () {

            var me = this;
            var url = this.serviceLayer.url + '/layers';
            var layersRequest = esriRequest({
                url: url,
                content: { f: "json" },
                callbackParamName: 'callback',
                handleAs: 'json'
            });
            layersRequest.then(
               function (response) {
                   var tocLayers = me.storageProvider.get("dialTOCLayers");
                   if (tocLayers == null) tocLayers = [];

                   var visLayers = me.storageProvider.get("dialVisLayers");
                   if (visLayers == null) visLayers = [];

                   var div = domConstruct.create("div", {style: "width:300px;"});
                   var layers = response.layers.sort(function (a, b) {
                       return (a.name > b.name) ? 1 : -1;
                   });

                   array.forEach(layers, function (lyr) {
                       if (lyr.type == "Feature Layer") {
                           lyr.inTOC = (array.indexOf(tocLayers, lyr.name) > -1) ? true : false;
                           lyr.isVis = (array.indexOf(visLayers, lyr.name) > -1) ? true : false;
                           var DialogNode = new _DialogNode(lyr.name, lyr.id, lyr.inTOC);
                           DialogNode.placeAt(div, "last");
                           me.layers.push(lyr);
                       }
                   });
                   me.dialog.set("content", div);

                   //-- Create the TOC
                   var layersForToc = array.filter(me.layers, function (item) { return item.inTOC == true; }).sort(function (a, b) {
                       return (a.id > b.id) ? 1 : -1;
                   });

                   array.forEach(layersForToc, function (lyr) {
                       var TOCnode = new _TOCnode(lyr.name, lyr.id, lyr.isVis);
                       TOCnode.placeAt(me.tocDomNode, "last");
                   });

                   me._setVisLayers();

               }, function (error) {
                   console.log("Error: ", error.message);
               });

        },
        _addToTOC: function (e) {
            //-- Get the layer and set it's properties.
            var id = +e.value.replace("toc_", "");
            var layer = array.filter(this.layers, function (item) { return item.id == id; })[0];
            layer.isVis = true;
            layer.inTOC = true;
            
            //-- Create the new TOC dom element and place it accordingly
            tocIndexes = this._getTOCindexes();
            var TOCnode = new _TOCnode(layer.name, layer.id, true);
            var placeIndex = array.indexOf(tocIndexes, id);
            TOCnode.placeAt(this.tocDomNode, placeIndex);

            this._storeTOCLayers();
            this._setVisLayers();

        },

        _removeFromTOC: function (e) {
            //-- Get the layer and set it's properties.
            var id = +e.value.replace("toc_", "");
            var layer = array.filter(this.layers, function (item) { return item.id == id; })[0];
            layer.isVis = false;
            layer.inTOC = false;

            //-- Destroy the TOC dom element
            var widget = dijit.byId(e.value);
            widget.destroyRecursive(true);
            domConstruct.destroy(widget.id);

            this._storeTOCLayers();
            this._setVisLayers();

        },

        _showOnMap: function (e) {
            var id = +e.value.replace("toc_", "");
            var layer = array.filter(this.layers, function (item) { return item.id == id; })[0];
            layer.isVis = true;
            this._setVisLayers();
        },

        _hideOnMap: function (e) {
            var id = +e.value.replace("toc_", "");
            var layer = array.filter(this.layers, function (item) { return item.id == id; })[0];
            layer.isVis = false;
            this._setVisLayers();
        },
        _setTOCstyle: function (e) {
            var layers = this.layers;
            var mapScale = this.map.getScale();
            var serviceLayer = this.serviceLayer;

            array.forEach(this.tocDomNode.childNodes, function (node) {
                if (node.id.indexOf("toc_") > -1) {
                    var id = node.id.replace("toc_", "");
                    var lyr = array.filter(layers, function (item) { return item.id == id; })[0];
                    var minScale = lyr.minScale;
                    var maxScale = lyr.maxScale;
                    if (lyr.parentLayer) {
                        var plyr = serviceLayer.layerInfos[lyr.parentLayer.id];
                        if (plyr.minScale > minScale) minScale = plyr.minScale;
                        if (plyr.maxScale < maxScale) maxScale = plyr.maxScale;
                    }

                    if (minScale < mapScale | maxScale > mapScale) {
                        console.log("out of view - " + lyr.name);
                        console.log("-----------------------");
                    }


                }
            });
        },
        showLayers: function () {
            this.dialog.show();
        },
        _getTOCindexes: function () {
            //-- Determine the layer indexes in the TOC
            var layersInTOC = array.filter(this.layers, function (item) { return item.inTOC == true; });
            var tocIndexes = [];
            array.forEach(layersInTOC, function (value, i) {
                tocIndexes.push(value.id);
            });
            tocIndexes.sort(function (a, b) { return a - b });
            return tocIndexes;
        },
        _setVisLayers: function () {
            //-- Add/Remove visible items to the map
            var mapVisLayers = array.filter(this.layers, function (item) { return item.isVis == true; });
            var mapVisIndexes = [-1];
            var mapOpIndexes = [-1];
            var visLayers = [];
            array.forEach(mapVisLayers, function (value, i) {
                if (value.geometryType == "esriGeometryPolygon") {
                    mapOpIndexes.push(value.id);
                } else {
                    mapVisIndexes.push(value.id);
                }
                visLayers.push(value.name);
            }); 

            this.serviceLayer.setVisibleLayers(mapVisIndexes);
            this.opacityLayer.setVisibleLayers(mapOpIndexes);
            this.storageProvider.put("dialVisLayers", visLayers);

        },
        _storeTOCLayers: function () {
            var layersForToc = array.filter(this.layers, function (item) { return item.inTOC == true; });
            var tocLayers = [];
            array.forEach(layersForToc, function (value, i) {
                tocLayers.push(value.name);
            });
            this.storageProvider.put("dialTOCLayers", tocLayers);
        }

    });


}
);

