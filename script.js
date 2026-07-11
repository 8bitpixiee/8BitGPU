function setHair(choice) {
  const hairLayer=document.getElementById("hairLayer");
  if (choice==="none" {
    hairLayer.style.display="none";
  }
  else {
    hairLayer.style.display="block";
    hairLayer.src=choice;
  }
}
