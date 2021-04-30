const ctx = window.document.getElementById("updownChart");

const data = {
  labels: ["Positive", "Negative"],
  datasets: [
    {
      label: "Tweets Sentiment into Groups",
      backgroundColor: ["#3e95cd", "#8e5ea2"],
      data: [-2478, 5267]
    }
  ]
}

const options = {
  scales: {
      // yAxes: [{
      //     ticks: {
      //         beginAtZero: true
      //     }
      // }]
  }
}

var myBarChart = new Chart(ctx, {
  type: 'bar',
  data: data,
  // options: options
});