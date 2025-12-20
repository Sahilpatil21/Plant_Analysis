const User = require("../model/UserRegister");
const bcryptjs=require("bcryptjs")
const JWT=require("jsonwebtoken")
const isAuthenticated = (req, res, next) => {
    const token = req.cookies?.Token; // Changed 'token' to 'Token' to match the cookie name
    
    if (!token) {
        return res.redirect('/login'); // Added return to prevent further execution
    }
    
    try {
        const decoded = JWT.verify(token, 'anykey');
        req.user = decoded;
        return next();
    } catch (err) {
        console.error('JWT ERROR:', err);
        res.clearCookie('Token'); // Clear invalid token
        return res.redirect('/login');
    }
};
const registerget=(req,res)=>{
    res.render("register")
}
const registerpost=async(req,res)=>{
    const {name,email,password}=req.body
    try {
        const existingUser=await User.findOne({email})
        if(existingUser){
            return res.status(400).send("User already exists")
        }
        const HashPass=await bcryptjs.hash(password,10)

        await User.create({
            name,
            email,
            password:HashPass
        })
        res.redirect("/login")
    } catch (error) {
       console.log(error) 
    }
    
}
const getLoggedin=(req,res)=>{
    res.render("login")
}
const LoginSuccess=async(req,res)=>{
   try {
    const {email,password}=req.body
    const UserFound=await User.findOne({email})
    
    if(!UserFound || !(await bcryptjs.compare(password, UserFound.password))) {
        return res.status(401).render('login', { error: 'Invalid email or password' });
    }
    
    const token = JWT.sign({
        id: UserFound._id,
        email: UserFound.email,
        name: UserFound.name
    }, 'anykey', { expiresIn: '3d' });
    
    res.cookie('Token', token, {
        httpOnly:true,
        secure:false,
        sameSite:'strict'
    })
     return res.redirect("/analyze")
   } catch (error) {
    console.log(error)
   }
}
module.exports={isAuthenticated,registerget,registerpost,getLoggedin,LoginSuccess}

