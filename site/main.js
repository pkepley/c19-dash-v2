var covid_viz = (function (){
const root_url = '.';
const data_url = root_url + '/data';

function movingAverage(values, N) {
  let i = 0;
  let sum = 0;
  const means = new Float64Array(values.length).fill(NaN);
  for (let n = Math.min(N - 1, values.length); i < n; ++i) {
    sum += values[i];
  }
  for (let n = values.length; i < n; ++i) {
    sum += values[i];
    means[i] = sum / N;
    sum -= values[i - N + 1];
  }
  return means;
}

Promise.all([
  d3.csv(data_url + '/state_mapping.csv'),
  
  d3.csv(data_url + '/us_covid_cases.csv', function(d) {
    return {
      report_date_str: d.report_date,      
      report_date: d3.timeParse('%Y-%m-%d')(d.report_date),
      state: d.state,
      confirmed: +d.confirmed,
      confirmed_daily: +d.confirmed_daily,      
      deaths: +d.deaths,
      deaths_daily: +d.deaths_daily,
      case_fatality: +d.deaths / +d.confirmed
    };
  }),

  d3.csv(data_url + '/us_population.csv', function(d) {
    return {
      state: d.state,
      population: +d.population
    };
  }),
]).then(function(datasets) {
  //------------------- Initial Data Manipulation --------------------
  // rename the datasets
  const state_info = datasets[0];
  var   us_covid_cases = datasets[1];
  const us_population = datasets[2];

  // map: state => region
  var state_region_map = {};
  state_info.forEach(function(row){
    state_region_map[row.state_abbrev] = row.state_region;
  });

  // map: state => population
  var state_pop_map = {};
  us_population.forEach(function(row){
    state_pop_map[row.state] = row.population;
  });

  // update covid case data with region & per capita data
  us_covid_cases.forEach(function(d) {
    d.region = state_region_map[d.state];
    d.confirmed_per_capita = d.confirmed / state_pop_map[d.state];
    d.deaths_per_capita = d.deaths / state_pop_map[d.state];
    d.confirmed_daily_per_capita = d.confirmed_daily / state_pop_map[d.state];
    d.deaths_daily_per_capita = d.deaths_daily / state_pop_map[d.state];
  });

  // last actual date
  var tmp = d3.max(us_covid_cases, (d) => d.report_date_str);
  var us_covid_cases_most_recent = us_covid_cases
      .filter(d => (d.report_date_str == tmp));
  
  //--------------------- App Architecture ----------------------
  // Region Selection
  var region_selector_div = d3.select('#div_region_selection');

  var region_selector = region_selector_div
      .append('select')
      .attr('id', 'region_selector');  
  var regions = ['Northeast', 'Midwest', 'South', 'West'];
  
  region_selector
    .on('change', update)
    .selectAll('option')
    .data(regions)
    .enter()
    .append('option')
    .text(function (d) { return d;})
    .property('value', d=>d);

  region_selector.property('selected', 'Midwest')
    .property('value', 'Midwest');

  // get selected region
  function getRegion(){  
    var regionSelector = d3.select('#region_selector');
    return regionSelector.property('value');    
  }

  // get states in selected region
  function getStatesInRegion() {
    var region = getRegion();
    return state_mapping.filter(d => d.state_region == region);
  }
  
  // get date from calendar
  function getDateFromCalendar() {
    return $('#calendar_picker').datepicker('getDate');
  }

  // cumu or new
  function getCumuOrNew() {
    return d3.select('input[name="cumu_or_new"]:checked').property("value");    
  }

  // cumu or new
  function getPlotLevel() {
    return d3.select('input[name="plot_level"]:checked').property("value");    
  }  

  //----------------------------- SVGs! --------------------------------
  var margin = {top: 50, right: 80, bottom: 30, left: 70},
      fullWidth = 750,
      fullHeight = 350,
      width  = fullWidth - margin.left - margin.right,
      height = fullHeight - margin.top - margin.bottom;
  
  function addSVG(svgID, svgParent) {
    var svg = d3.select(svgParent)
	.append('svg')
    //.attr('width',  fullWidth)
    //.attr('height', fullHeight)
	.attr('preserveAspectRatio', 'xMinYMin meet')
	.attr('viewBox', '0 0 ' + fullWidth + ' ' + fullHeight + '')
	.classed('svg-content', true)    
	.attr('id', svgID);
    
    svg = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
      .attr('class', 'plot_region');
    
    return svg;
  }
  
  
  function displayVariable(yName) {
    var displayVar = yName;
    
    if (!yName.includes('case_fatality')) {      
      if (getCumuOrNew() == 'Cumulative') {
	displayVar = yName;
      }
      else {
	displayVar = yName + '_daily';
      }
      if (getPlotLevel() == 'per_capita') {
	displayVar = displayVar + "_per_capita";
      }
      else if (getPlotLevel() == 'per_100_k') {
	displayVar = displayVar + '_per_100_k';
      }
    }
    else {
      displayVar = 'case_fatality';
    }

    return displayVar;
  }
  

  function titleString(yName) {
    if (yName == 'case_fatality') {
      return 'Case Fatality Rate (Cumulative Deaths / Cumulative Confirmed)';
    }
    else {
      // capitalize!
      var prettyName = yName.charAt(0).toUpperCase() + yName.slice(1);
      if (prettyName == "Confirmed") {
	prettyName = prettyName + " Cases";
      }
      var plotLevel = getPlotLevel();
      if (plotLevel == "per_capita") {
	prettyName = prettyName + " Per Capita";
      }
      else if (plotLevel == "per_100_k") {
	prettyName = prettyName + " Per 100k";
      }
      return `${getCumuOrNew()} ${prettyName} by Reporting Date`;	
    }     
  }

  
  // update a given SVG
  function updateSVG(svgID, yName){
    var region = getRegion();                        
    var svg = d3.select(`#${svgID}`);
    var gPlotRegion = svg.selectAll('.plot_region');
    var yNamePlot = displayVariable(yName);
    
    // remove existing lines      
    gPlotRegion.selectAll('g').remove();
    gPlotRegion.selectAll('path').remove();
    gPlotRegion.selectAll('.title').remove();
    
    // title
    gPlotRegion.append('text')
      .attr('x', 0)
      .attr('y', 0 - (margin.top / 2))
      .attr('text-anchor', 'left')
      .style('font-size', '22px')
      .style('fill', 'white')
      .attr('class', 'title')
      .text(titleString(yName));
    
    var minDate = d3.isoParse(getDateFromCalendar());
    var maxDate = d3.max(us_covid_cases, (d) => d.report_date);
    
    // data only for region
    var dataRegion = us_covid_cases
    	.filter(d => (d.region == region))
    	.filter(d => (d.report_date >= minDate));

    // data parsed out by state
    var dataState = d3.nest()
	.key(function (d) {return d.state;})
	.entries(dataRegion);

    // x-coordinate stuff      
    var xScale = d3.scaleTime()
    	.domain([minDate, maxDate])
    	.range([0, width]);

    // x-axis
    gPlotRegion.append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(xScale)
    	    .tickFormat(d3.timeFormat('%b-%d')));

    // y-variable...
    if (getPlotLevel() == "per_100_k" && yName != "case_fatality") {
      yVarFun = (d) => 100000 * d[yNamePlot.replace("per_100_k", "per_capita")];
    }
    else {
      yVarFun = (d) => d[yNamePlot];      
    }
    
    // y-coordinate stuff       
    var minY  = 0;
    var maxY  = d3.max(dataRegion, yVarFun);
    
    var yScale = d3.scaleLinear()
    	.domain([minY, maxY])
    	.range([height, 0]);

    // legend formatting
    if (yNamePlot.includes("per_capita") || yName == "case_fatality") {
      var nDigits = Math.abs(-Math.min(0, Math.floor(Math.log10(100 * maxY))));
      nDigits = (nDigits > 0) ? (nDigits + 1) : nDigits;     
      var yAxisFormat = d3.format(`.${nDigits}%`);
    }
    else {
      var yAxisFormat = d3.format(",");
    }
    
    // add axis
    gPlotRegion.selectAll('.y-axis').remove();    
    var yAxis = gPlotRegion.append('g')
    	.attr('class', 'y-axis')
    	.attr('transform', `translate(0,0)`)
    	.call(d3.axisLeft(yScale).tickFormat(yAxisFormat));
    
    // append legend
    var legend = gPlotRegion.append('g')
	.attr('transform',
	      `translate(${width+0.125*margin.left}, 0)`);	      

    // color-scale
    var color =  d3.scaleSequential(d3['interpolateBlues'])
      	.domain([dataState.length, 0]);
    
    // mouse-over handler for lines/legend entries
    mouse_over = function (d, i) {
      d3.selectAll('.region')
	.attr('opacity', '.25');
      
      d3.selectAll(`path[id='line-${d.key}']`)// + d.key)
	.attr('stroke', 'red')
	.attr('opacity', '1.0');
      
      d3.selectAll('.square-' + d.key)
	.style('fill', 'red');
    };
    
    // mouse-out event handler for lines/legend entries	
    mouse_out = function (d, i) {
      d3.selectAll(`#line-${d.key}`)
	.attr('stroke', color(i));
      
      d3.selectAll('.square-' + d.key)
	.style('fill', color(i));
      
      d3.selectAll('.region')
	.attr('opacity', '1');	    
    };

    // update the lines
    gPlotRegion.selectAll('.region')
      .data(dataState)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', function(d, i) { return color(i) })	
      .attr('stroke-width', 2.0)
      .attr('id', function(d) { return 'line-' + d.key; })		
      .attr('class', 'region')	
      .attr('d', function(d){
      	return d3.line()
      	  .x(function(d) { return xScale(d.report_date); })
      	  .y(function(d) { return yScale(yVarFun(d));}) //d[yNamePlot]);  })		
      	(d.values);
      })
      .on('mouseover', mouse_over)
      .on('mouseout', mouse_out);

    // add the legend swatches    
    legend.selectAll('.labelsquares')
      .remove();
    legend.selectAll('.labelsquares')
      .data(dataState)
      .enter()
      .append('rect')
      .attr('class', 'labelsquares')
      .attr('class', function(d) { return 'square-' + d.key; })	
      .attr('x', 0)
      .attr('y', function(d, i) { return i * (15) })
      .attr('width', 12.5)
      .attr('height', 12.5)
      .style('fill', function(d, i) { return color(i) });

    // add text for the legend
    legend.selectAll('.labeltext')
      .remove();    
    legend.selectAll('.labeltext')
      .data(dataState)
      .enter()
      .append('text')
      .attr('class', 'labeltext')		
      .attr('x', 24)
      .attr('y', function(d, i) { return 12.5 + i * (15); })
      .attr('font-size', 11)
      .style('fill', 'white')
      .text(function(d) { return d.key; });

    // invisible rectangles for handling mouse-over events
    legend.selectAll('.labelhandles')
      .remove();    
    legend.selectAll('.labelhandles')
      .data(dataState)
      .enter()
      .append('rect')
      .attr('class', 'labelhandles')
      .attr('id', function(d) { return 'handle-' + d.key; })	
      .attr('x', 0)
      .attr('y', function(d, i) { return i * (15); })
      .attr('width', 45)
      .attr('height', 12.5)
      .style('opacity', 0)
      .on('mouseover', mouse_over)
      .on('mouseout', mouse_out);
    
  }    
  

  function updateTable() {
    var region = getRegion();    
    var tmpdata = us_covid_cases_most_recent.filter(d => (d.region == region));
    
    d3.select('#today_table tbody')
      .selectAll('tr')
      .remove();
    
    var rows = d3.select('#today_table tbody')
	.selectAll('tr')
	.data(tmpdata)
    	.enter()
     	.append('tr')
	.attr('scope', 'row')
	.attr('class', 'text-right');

    var cells = rows.selectAll('td')
	.data(function (row) {
	  return ['state', 'confirmed', 'deaths'].map(function (column) {
	    return {column: column,
		    value: (column == 'state' ? row['state'] : d3.format(',')(row[column]))};
	  });
	})
	.enter()
	.append('td')
	.text( (d) => d.value );
  }
  
  // update!
  function update(){
    updateSVG('svg_confirmed_cases', 'confirmed');
    updateSVG('svg_deaths', 'deaths');        
    updateSVG('svg_case_fatality', 'case_fatality');    
    updateTable();
  };
  
  function onLoadPage(){       
    // svg for confirmed cases
    addSVG('svg_confirmed_cases', '#div_confirmed');

    // svg for deaths
    addSVG('svg_deaths', '#div_deaths');

    // svg for case-fatality ratio
    addSVG('svg_case_fatality', '#div_case_fatality');

    // calendar
    $('#div_date_picker .input-group.date').datepicker({
      format: 'yyyy-mm-dd',
      startDate: '2020-03-15',
      immediateUpdates: true,      
      autoclose: true,
      defaultViewDate: new Date('2020-03-15')
    }).on('changeDate', function(){
      $('#calendar_picker').datepicker('update');
      update();
    });

    // set the start date
    $('#calendar_picker').datepicker('setDate', new Date('2020-03-15'));        
    
    // update when cumu_or_new is updated
    $('input[name="cumu_or_new"]').on("change", update);        

    // update when plot_level is updated
    $('input[name="plot_level"]').on("change", update);           
    
    update();    
  }

  // initialize
  onLoadPage();
});

})();
