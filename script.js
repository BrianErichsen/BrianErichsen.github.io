import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { feature, mesh } from 'https://cdn.jsdelivr.net/npm/topojson@3/+esm';

const width = 960;
const height = 600;

window.onload = async function() {
    // Load US map data and create the map
    const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    console.log("Loaded US Map Data:", us);
    
    // Load the COVID data
    const data = await loadData('01-01-2021.csv');

    createMap(us, data);
    createConfirmedChart(data);
    createDeathChart(data);
};

// Function to load and parse CSV
async function loadData(file) {
    // Load CSV data using D3 and auto-detect data types
    const data = await d3.csv(file, d3.autoType);
    console.log("Loaded Data:", data);
    // Return an array of objects with selected fields
    return data.map(d => ({
        state: d.Province_State,
        confirmed: +d.Confirmed,
        deaths: +d.Deaths,
        recovered: d.Recovered,
        lat: d.Lat,
        long: d.Long_,
        active: d.Active
    }));
}

async function createMap(us, data) {

    // Define a color scale based on confirmed cases
    const color = d3.scaleSequential()
        .domain([0, d3.max(data, d => d.confirmed)])
        .interpolator(d3.interpolateReds);

    //death circle in each state
    const radius = d3.scaleSqrt().domain([0, d3.max(data, d => d.deaths)])
    .range([0, 15]);

    // Define the zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", zoomed);


    // Create the SVG container
    const svg = d3.select("#map")
        .attr("viewBox", [0, 0, width, height])
        .attr("width", width)
        .attr("height", height)
        .attr("style", "max-width: 100%; height: auto;")
        .on("click", reset);

    // Define the projection and path generator
    const projection = d3.geoAlbersUsa()
        .scale(1300)
        .translate([width / 1000, height / 1000]);

    const path = d3.geoPath().projection(projection);

    // Create a group for the map
    const g = svg.append("g");

    // Create and style the state paths
    const states = g.append("g")
        .attr("fill", "#444")
        .attr("cursor", "pointer")
        .selectAll("path")
        .data(feature(us, us.objects.states).features)
        .join("path")
        .on("click", clicked)
        .on("mouseover", mouseover)
        .on("mouseout", mouseout)
        .attr("d", path)
        .attr("fill", d => {
            const stateData = data.find(state => state.state === d.properties.name);
            return stateData ? color(stateData.confirmed) : '#ccc';
        });

    // Add state names as tooltips
    states.append("title")
        .text(d => d.properties.name);

    // Add state borders
    g.append("path")
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-linejoin", "round")
        .attr("d", path(mesh(us, us.objects.states, (a, b) => a !== b)));


    //appends each circle that represens proportion of death per state
    g.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("transform", d => {
            if (d.lat !== null && d.long !== null) {
                const coords  = projection([d.long, d.lat]);
                if (coords) {
                    //for debugging purposes we are logging each coordinate
                    console.log(`State: ${d.state}, Coordinates: (${d.lat}, ${d.long}), Projection: (${coords[0]}, ${coords[1]})`);
                    return `translate(${coords[0]},${coords[1]})`;
                }
            }
            return "translate(-9999, -9999)";
        })
        .attr("r", d => radius(d.deaths))
        .attr("fill", "black")
        .attr("opacity", 0.7);

    // Apply the zoom behavior to the SVG
    svg.call(zoom);

    // Reset the zoom and map fill
    function reset() {
        states.transition().style("fill", null);
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity,
            d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
        );
    }

    // Handle state click events for zooming
    function clicked(event, d) {
        const [[x0, y0], [x1, y1]] = path.bounds(d);
        event.stopPropagation();
        states.transition().style("fill", null);
        d3.select(this).transition().style("fill", "red");
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity
              .translate(width / 2, height / 2)
              .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
              .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
            d3.pointer(event, svg.node())
        );
        const stateData = data.find(state => state.state === d.properties.name);
        if (stateData) {
            console.log("Selected State Data: ", stateData);
            updateStateBarChart(stateData);
        } else {
            console.error("No data found for state: ", d.properties.name);
        }
    }

    // Handle zoom events
    function zoomed(event) {
        const { transform } = event;
        g.attr("transform", transform);
        g.attr("stroke-width", 1 / transform.k);
    }

    function mouseover(event, d) {
        d3.select(this).classed("state-highlight", true);
            // Highlight the corresponding bars in both charts
        d3.select("#confirmedChart").selectAll(".bar")
        .filter(barData => barData.state === d.properties.name) // Ensure matching data key
        .classed("highlight", true);
        d3.select("#deathChart").selectAll(".bar")
        .filter(barData => barData.state === d.properties.name) // Ensure matching data key
        .classed("highlight", true);
    }

    function mouseout(event, d) {
        //outlines state
        d3.select(this).classed("state-highlight", false);
        // Remove highlighting from confirmed COVID Cases BarChart
        d3.select("#confirmedChart").selectAll(".bar")
        .filter(barData => barData.state === d.properties.name) // Ensure matching data key
        .classed("highlight", false);
        // Remove highlighting from COVID Death Cases BarChart
        d3.select("#deathChart").selectAll(".bar")
        .filter(barData => barData.state === d.properties.name) // Ensure matching data key
        .classed("highlight", false);
    }

    // Initial center and scale for the map
    const initialScale = 0.8;
    const initialTranslate = [width / 2, height / 2];
    svg.call(zoom.transform, d3.zoomIdentity.translate(initialTranslate[0], initialTranslate[1]).scale(initialScale));
} // end of create map method

//Function to create the confirmed cases bar chart
function createConfirmedChart(data) {
    const margin = { top: 20, right: 30, bottom: 100, left: 60 },
        width = 700 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    // Create scales
    const xScale = d3.scaleBand()
    .domain(data.map(d => d.state))
    .range([0, width])
    .padding(0.1);

    const yScaleConfirmed = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.confirmed)])
    .nice()
    .range([height, 0]);

    // Create SVG container
    const svgConfirmed = d3.select("#confirmedChart")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw axes
    svgConfirmed.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

    //adds title
    svgConfirmed.append("text")
    .attr("x", (width / 2) + margin.left)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .text("COVID-19 Confirmed Cases by State");
    
    svgConfirmed.append("g")
    .call(d3.axisLeft(yScaleConfirmed));

    // Draw bars
    svgConfirmed.selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => xScale(d.state))
    .attr("y", d => yScaleConfirmed(d.confirmed))
    .attr("width", xScale.bandwidth())
    .attr("height", d => height - yScaleConfirmed(d.confirmed))
    .attr("fill", "steelblue")
    .on("mouseover", function(event, d) {
        //d3.select('#map').selectAll("path").classed("highlight", false);
        d3.select(this).classed("highlight", true);
        d3.select("#deathChart").selectAll(".bar")
        .filter(barData => barData.state === d.state)
        .classed("highlight", true);
        d3.select("#map").selectAll("path")
        .filter(stateData => stateData && stateData.properties && stateData.properties.name === d.state)
        .classed("highlight", true);
    })

    .on("mouseout", function(event, d) {
        //removes highlight for me (Confirmed Case Bar Chart)
        d3.select(this).classed("highlight", false);
        //removes highlight for me (Confirmed Case Bar Chart)
        d3.select("#deathChart").selectAll(".bar")
        .filter(barData => barData.state === d.state)
        .classed("highlight", false);
        
        // // Remove highlighting state map
        d3.select("#map").selectAll("path")
        .filter(stateData => stateData && stateData.properties && stateData.properties.name === d.state)
        .classed("highlight", false);
    });
}

// Function to create the deaths bar chart
function createDeathChart(data) {
    const margin = { top: 20, right: 30, bottom: 100, left: 40 },
        width = 700 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    // Create scales
    const xScale = d3.scaleBand()
    .domain(data.map(d => d.state))
    .range([0, width])
    .padding(0.1);

    const yScaleDeaths = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.deaths)])
    .nice()
    .range([height, 0]);

    // Create SVG container
    const svgDeaths = d3.select("#deathChart")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);


    // Add title to the deaths chart
    svgDeaths.append("text")
    .attr("x", (width / 2) + margin.left)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .text("COVID-19 Deaths by State");
    
    // Draw axes
    svgDeaths.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

    svgDeaths.append("g")
    .call(d3.axisLeft(yScaleDeaths));

    // Draw bars
    svgDeaths.selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => xScale(d.state))
    .attr("y", d => yScaleDeaths(d.deaths))
    .attr("width", xScale.bandwidth())
    .attr("height", d => height - yScaleDeaths(d.deaths))
    .attr("fill", "steelblue")
    //Bars "highlight" orange on hover
    .on("mouseover", function(event, d) {
        //make my bar orange (death)
        d3.select(this).classed("highlight", true);

        //make c
        d3.select("#confirmedChart").selectAll(".bar")
        .filter(barData => barData.state === d.state)
        .classed("highlight", true);

        // // Highlight state in the map
        d3.select("#map").selectAll("path")
        .filter(stateData => stateData && stateData.properties && stateData.properties.name === d.state)
        .classed("highlight", true);
    })
    //Bars "un-highlight" back to blue
    .on("mouseout", function(event, d) {
        //remove highlight from my bar (Death Bar Chart)
        d3.select(this).classed("highlight", false);

         //remove highlight from my bar (Confrimed Case Bar Chart)
        d3.select("#confirmedChart").selectAll(".bar")
        .filter(barData => barData.state === d.state)
        .classed("highlight", false);

        // // Remove highlighting state map
        d3.select("#map").selectAll("path")
        .filter(stateData => stateData && stateData.properties && stateData.properties.name === d.state)
        .classed("highlight", false);
    });
}

function updateStateBarChart(stateData) {
    // Remove the existing state details chart if it exists
    d3.select("#stateDetailsChart").remove();

    // Define the dimensions and margins for the state details chart
    const margin = { top: 20, right: 30, bottom: 40, left: 60 },
        width = 500 - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    // Create a new SVG container for the state details chart
    const svgStateDetails = d3.select("body").append("svg")
        .attr("id", "stateDetailsChart")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Define the data for the state details chart
    const stateDetailsData = [
        { category: "Confirmed", value: stateData.confirmed },
        { category: "Deaths", value: stateData.deaths },
        { category: "Recovered", value: stateData.recovered},
        { category: "Active cases", value: stateData.active}
    ];

    // Define the scales for the state details chart
    const xScale = d3.scaleBand()
        .domain(stateDetailsData.map(d => d.category))
        .range([0, width])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(stateDetailsData, d => d.value)])
        .nice()
        .range([height, 0]);

    // Draw the axes for the state details chart
    svgStateDetails.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    svgStateDetails.append("g")
        .call(d3.axisLeft(yScale));

    // Draw the bars for the state details chart
    svgStateDetails.selectAll(".bar")
        .data(stateDetailsData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.category))
        .attr("y", d => yScale(d.value))
        .attr("width", xScale.bandwidth())
        .attr("height", d => height - yScale(d.value))
        .attr("fill", "steelblue");

    // Add title to the state details chart
    svgStateDetails.append("text")
        .attr("x", (width / 2))
        .attr("y", 0 - (margin.top / 2))
        .attr("text-anchor", "middle")
        .attr("font-size", "16px")
        .attr("font-weight", "bold")
        .text(`COVID-19 Details for ${stateData.state}`);
}//end of update state bar chart method