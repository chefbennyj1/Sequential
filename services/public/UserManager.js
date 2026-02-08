

async function getCurrentUser() {
  let currentUser;

  //GET user data for the page
  let response;

  try {
    response = await fetch('/api/user');
  } catch (err) {    
    throw new Error("User not logged in");
  }

  let json = await response.json();
  console.log(json)

  if (!json.ok) {   
    throw new Error("User not logged in");
  }
  return json.user;
}

async function getUserAvatar(user) {

}



module.exports = { getCurrentUser, getUserAvatar };