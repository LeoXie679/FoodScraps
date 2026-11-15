import L from 'leaflet'
// The plugin attaches L.markerClusterGroup to the global L that Leaflet sets.
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  createElementObject,
  createLayerComponent,
  extendContext,
} from '@react-leaflet/core'
import './MarkerClusterGroup.css'

function clusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 38 : count < 100 ? 44 : 50
  return L.divIcon({
    html: `<span>${count}</span>`,
    className: 'food-cluster',
    iconSize: [size, size],
  })
}

/**
 * <MarkerClusterGroup> for react-leaflet: child <Marker>s are added to an
 * L.markerClusterGroup instead of the map. The ref is the Leaflet instance
 * (needed for zoomToShowLayer).
 */
const MarkerClusterGroup = createLayerComponent(
  // eslint-disable-next-line no-unused-vars
  function createClusterGroup({ children: _children, ...options }, ctx) {
    const instance = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 45,
      iconCreateFunction: clusterIcon,
      ...options,
    })
    return createElementObject(
      instance,
      extendContext(ctx, { layerContainer: instance }),
    )
  },
)

export default MarkerClusterGroup
